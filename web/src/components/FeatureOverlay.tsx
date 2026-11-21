import type { CircularGalleryItem, PresentationFeature } from './CircularGallery'

type Props = {
  item: CircularGalleryItem
  onClose: () => void
}

const latency = [
  { label: 'Retrieval', value: 0.3, display: '0.3 ms', detail: 'release · 200 runs' },
  { label: 'Verify', value: 81, display: '81 ms', detail: 'warm · 3 runs' },
  { label: 'Generate', value: 127, display: '127 ms', detail: 'warm · 3 runs' },
] as const

const memory = [
  { label: 'FrontDesk', value: 0.3, display: '0.30 GB', detail: 'Rust + WebView' },
  { label: 'Ollama', value: 0.1, display: '0.10 GB', detail: 'parent process' },
  { label: 'llama-server', value: 3.74, display: '3.74 GB', detail: 'Phi-4 Mini loaded' },
] as const

const disk = [
  ['Phi-4 Mini Q4_K_M', '2.3 GB'],
  ['Whisper base', '57 MB'],
  ['all-MiniLM-L6-v2', '87 MB'],
  ['Web bundle', '1.4 MB · 415 KB gzip'],
  ['Index + audit', 'KB for the demo'],
] as const

function PerformanceBody() {
  return (
    <div className="presentationOverlay__performance">
      <div className="perfGrid">
        <section className="perfCard">
          <header>
            <p className="perfCard__kicker">Latency</p>
            <h4>Warm local pipeline</h4>
          </header>
          <div className="perfBars">
            {latency.map((metric) => (
              <div className="perfBar" key={metric.label}>
                <span className="perfBar__label">{metric.label}</span>
                <div className="perfBar__track">
                  <i
                    style={{
                      width: `${Math.max(2, Math.min(100, (metric.value / 140) * 100))}%`,
                    }}
                  />
                </div>
                <strong>{metric.display}</strong>
                <em>{metric.detail}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="perfCard">
          <header>
            <p className="perfCard__kicker">Memory</p>
            <h4>Resident with the model loaded</h4>
          </header>
          <div className="perfBars">
            {memory.map((metric) => (
              <div className="perfBar" key={metric.label}>
                <span className="perfBar__label">{metric.label}</span>
                <div className="perfBar__track">
                  <i
                    style={{
                      width: `${Math.max(2, Math.min(100, (metric.value / 4) * 100))}%`,
                    }}
                  />
                </div>
                <strong>{metric.display}</strong>
                <em>{metric.detail}</em>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="perfCard perfCard--wide">
        <header>
          <p className="perfCard__kicker">Disk footprint</p>
          <h4>Models and derived state</h4>
        </header>
        <dl className="perfDisk">
          {disk.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="presentationOverlay__method">
        <p>
          <strong>Method.</strong> Retrieval was timed with 200 release-mode queries over five
          fixture notes. Generate and verify are warm Ollama calls; resident memory is RSS from
          <code>ps</code> with Phi-4 Mini Q4_K_M loaded. Cold start adds model load time.
        </p>
        <p>
          <strong>Context budget.</strong> At most five reranked excerpts, 5,000 characters and
          8,192 model-context tokens.
        </p>
      </div>
    </div>
  )
}

function FeaturesBody({ features }: { features: PresentationFeature[] }) {
  return (
    <div className="featuresGrid">
      {features.map((feature) => (
        <article className="featureCard" key={feature.label}>
          <header>
            <p className="featureCard__tagline">{feature.tagline}</p>
            <h4>{feature.label}</h4>
          </header>
          <p className="featureCard__description">{feature.description}</p>
          <ul>
            {feature.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <span className="featureCard__metric">{feature.metric}</span>
        </article>
      ))}
    </div>
  )
}

export default function FeatureOverlay({ item, onClose }: Props) {
  const performance = item.kind === 'performance'
  const allFeatures = item.kind === 'features'

  return (
    <section className="diagramOverlay__panel presentationOverlay">
      <header className="diagramOverlay__head">
        <div>
          <p className="diagramOverlay__kicker">
            {performance ? 'Performance & memory' : allFeatures ? 'All features' : 'Feature'}
          </p>
          <h3>{item.text}</h3>
          {item.tagline ? (
            <p className="presentationOverlay__tagline">{item.tagline}</p>
          ) : null}
        </div>
        <div className="diagramOverlay__actions">
          <button
            type="button"
            className="diagramOverlay__close"
            onClick={onClose}
            aria-label="Close this slide"
          >
            ×
          </button>
        </div>
      </header>

      <div className="presentationOverlay__body">
        {performance ? (
          <PerformanceBody />
        ) : allFeatures ? (
          <>
            <p className="presentationOverlay__lead">{item.description}</p>
            <FeaturesBody features={item.features ?? []} />
          </>
        ) : (
          <>
            <p className="presentationOverlay__lead">{item.description}</p>
            <ul className="presentationOverlay__list">
              {item.bullets?.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
            {item.metric ? (
              <div className="presentationOverlay__metric">
                <span>Headline</span>
                <strong>{item.metric}</strong>
              </div>
            ) : null}
            <p className="presentationOverlay__note">
              Local-first: source text, prompts and results stay on the machine. Nothing is
              uploaded to a FrontDesk server.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
