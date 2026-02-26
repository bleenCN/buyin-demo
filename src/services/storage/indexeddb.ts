export const DB_NAME = "crawler-db"
export const DB_VERSION = 1
export const SHOP_STORE = "shops"

export type ShopRecord = Record<string, unknown> & {
  shop_id: string
  updated_at?: number
}

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SHOP_STORE)) {
        db.createObjectStore(SHOP_STORE, { keyPath: "shop_id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const getShopRecord = async (shopId: string): Promise<ShopRecord | null> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHOP_STORE, "readonly")
    const store = tx.objectStore(SHOP_STORE)
    const req = store.get(shopId)
    req.onsuccess = () => resolve((req.result as ShopRecord) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export const putShopRecord = async (record: ShopRecord): Promise<void> => {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHOP_STORE, "readwrite")
    const store = tx.objectStore(SHOP_STORE)
    store.put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const getAllShopRecords = async (): Promise<ShopRecord[]> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHOP_STORE, "readonly")
    const store = tx.objectStore(SHOP_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve((req.result as ShopRecord[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

export const clearShopRecords = async (): Promise<void> => {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHOP_STORE, "readwrite")
    const store = tx.objectStore(SHOP_STORE)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
