use chrono::Utc;
use reqwest::{Client, Url};

use crate::contracts::{SourceGrant, SourceRef};

const RESULT_LIMIT: usize = 5;
const USER_AGENT: &str = "FrontDesk/0.1 (local research assistant)";

/// Search public web snippets with Bing's RSS endpoint. Only the user's
/// question is sent; granted note, mail, calendar and OneNote text never is.
pub async fn search(
    question: &str,
    grant: &SourceGrant,
) -> Result<Vec<(SourceRef, String)>, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Could not prepare web search: {error}"))?;
    let mut url = Url::parse("https://www.bing.com/search")
        .map_err(|error| format!("Could not build the web search URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("q", question)
        .append_pair("format", "rss")
        .append_pair("count", &RESULT_LIMIT.to_string());
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Web search failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Web search returned HTTP {}.", response.status()));
    }
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read web results: {error}"))?;
    Ok(parse_rss(&body, grant))
}

fn parse_rss(body: &str, grant: &SourceGrant) -> Vec<(SourceRef, String)> {
    let mut results = Vec::new();
    for item in body.split("<item>").skip(1).take(RESULT_LIMIT) {
        let Some(title) = tag(item, "title") else {
            continue;
        };
        let Some(link) = tag(item, "link") else {
            continue;
        };
        let link = decode(&link);
        if !(link.starts_with("https://") || link.starts_with("http://")) {
            continue;
        }
        let title = strip_html(&decode(&title));
        let description = tag(item, "description")
            .map(|value| strip_html(&decode(&value)))
            .unwrap_or_default();
        let title = if title.trim().is_empty() {
            link.clone()
        } else {
            title.trim().to_string()
        };
        let hash = super::sha256_hex(format!("{}|{}", title, link).as_bytes());
        let source = SourceRef {
            id: format!("web:{}", &hash[..16]),
            grant_id: grant.id.clone(),
            kind: "web".into(),
            title: title.clone(),
            location: link.clone(),
            modified: Utc::now().to_rfc3339(),
            hash,
            people: Vec::new(),
        };
        let text = format!("Web result: {title}\nURL: {link}\n{description}");
        results.push((source, text));
    }
    results
}

fn tag(item: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = item.find(&open)? + open.len();
    let end = item[start..].find(&close)? + start;
    Some(item[start..end].trim().to_string())
}

fn strip_html(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut inside = false;
    for ch in value.replace("<![CDATA[", "").replace("]]>", "").chars() {
        match ch {
            '<' => inside = true,
            '>' if inside => {
                inside = false;
                out.push(' ');
            }
            _ if !inside => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode(value: &str) -> String {
    let mut out = value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    while let Some(start) = out.find("&#") {
        let Some(end) = out[start..].find(';').map(|offset| start + offset) else {
            break;
        };
        let digits = &out[start + 2..end];
        let decoded = digits
            .strip_prefix('x')
            .or_else(|| digits.strip_prefix('X'))
            .and_then(|hex| u32::from_str_radix(hex, 16).ok())
            .or_else(|| digits.parse::<u32>().ok())
            .and_then(char::from_u32);
        let Some(character) = decoded else {
            break;
        };
        out.replace_range(start..=end, &character.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bing_rss_and_decodes_entities() {
        let grant = SourceGrant {
            id: "web:search".into(),
            kind: "web".into(),
            scope: "web".into(),
            title: "Web search".into(),
            granted_at: "2026-11-18T00:00:00Z".into(),
        };
        let body = r#"<rss><channel><item><title>AI &amp; chips</title><link>https://example.com/a</link><description>&lt;b&gt;Latest&lt;/b&gt; news</description></item></channel></rss>"#;
        let hits = parse_rss(body, &grant);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0.title, "AI & chips");
        assert_eq!(hits[0].0.location, "https://example.com/a");
        assert!(hits[0].1.contains("Latest news"));
    }
}
