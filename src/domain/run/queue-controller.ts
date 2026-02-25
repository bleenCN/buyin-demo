export class ShopQueueController {
  private queue: string[] = []
  private cache: string[] = []
  private seen = new Set<string>()

  // 运行开始时重置瞬时状态，保留 cache 供热更新后继续消费
  resetForRun() {
    this.queue = []
    this.seen = new Set<string>()
  }

  clearAll() {
    this.queue = []
    this.cache = []
    this.seen = new Set<string>()
  }

  addShopIds(ids: string[]): string[] {
    const unique = ids.filter((id) => {
      if (this.seen.has(id)) return false
      this.seen.add(id)
      return true
    })
    if (unique.length === 0) return []

    this.queue.push(...unique)
    this.cache = [...this.cache, ...unique].filter(
      (value, index, array) => array.indexOf(value) === index
    )
    return unique
  }

  loadQueueFromCache() {
    this.queue = [...this.cache]
    this.seen = new Set(this.cache)
  }

  dequeue(): string | null {
    return this.queue.shift() ?? null
  }

  size() {
    return this.queue.length
  }

  hasItems() {
    return this.queue.length > 0
  }
}
