export function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function whenDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function bytes(value: number): string {
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value > 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}
