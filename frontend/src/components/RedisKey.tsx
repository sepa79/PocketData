export function redisListKey(sut: string, dataset: string, list: string) {
  return `${sut}:${dataset}:data:${list}`
}

export function RedisKey({ sut, dataset, list }: { sut: string; dataset: string; list: string }) {
  return <code className="pd-redis-key" aria-label={`Full Redis key: ${redisListKey(sut, dataset, list)}`}><span>{sut || '<sut>'}:{dataset || '<dataset>'}:data:</span><strong>{list || '<list>'}</strong></code>
}
