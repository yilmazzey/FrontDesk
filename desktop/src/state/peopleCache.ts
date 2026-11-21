import type { PeopleGraphData } from '../types/source'

let cache: PeopleGraphData | null = null

export function getPeopleCache(): PeopleGraphData | null {
  return cache
}

export function setPeopleCache(graph: PeopleGraphData | null) {
  cache = graph
}

export function clearPeopleCache() {
  cache = null
}
