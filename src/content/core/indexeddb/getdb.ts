/* ===================== IMPORTS ===================== */

import { debugVerbose } from "../debug";
import { isCallable } from "../utils/js/type";


/* ===================== TYPES ===================== */

export type DatabaseName = string;

export type RowMeta = {
    id: unknown
};


/* ===================== INTERNAL VARIABLES ===================== */

const _indexedDB = typeof window !== "undefined" ? window.indexedDB : globalThis.indexedDB;

export function _loadDatabase(name: string, version?: number): Promise<IDBDatabase> {
    const request = _indexedDB.open(name, version);

    return new Promise((r, f) => {
        request.onsuccess = () => {
            r(request.result);
        }
        request.onerror = () => {
            f(request.error);
        }
    })
}


/* ===================== PUBLIC API ===================== */

// ---- Database ----

/**
 * Check data about a database.
 * @param {DatabaseName} name The database name 
 */
export async function CheckIndexedDB(name: DatabaseName): Promise<{ exists: boolean, version: number | undefined }> {
    const databases = await _indexedDB.databases();

    const data = {
        exists: databases.some((db) => db.name === name),
        version: databases.find((db) => db.name === name)?.version
    };

    debugVerbose(`Obtained data about IndexedDB database: ${name}`, data);

    return data;
}

/**
 * Creates an IndexedDB database
 * @param {DatabaseName} name The database name 
 * @param {number} version The database's schema version. Increase this when you change its structure 
 */
export function CreateIndexedDB(name: DatabaseName, version: number, options: {
    onUpgrade: (request: IDBOpenDBRequest) => void
}): Promise<true> {
    const request = _indexedDB.open(name, version);

    request.onupgradeneeded = () => {
        if (isCallable(options.onUpgrade)) {
            options.onUpgrade(request);
        }
    };

    return new Promise((r, f) => {
        request.onsuccess = () => {
            request.result.close();
            r(true);
        };
        request.onerror = () => {
            f(request.error);
        };
        request.onblocked = (event) => {
            console.error(`CreateIndexedDB: Upgrade Blocked. Waiting...`, {currentVersion: event.oldVersion, requestedVersion: event.newVersion});
        };
    });
}

/**
 * Load a database. Prefer WithIndexDB where appropriate for automatic cleanup.
 * @param name The database's name 
 * @returns The database instance
 */
export async function LoadIndexDB(name: DatabaseName): Promise<IDBDatabase> {
    if (!(await CheckIndexedDB(name)).exists) {
        throw new Error(`Failed to load IndexedDB database: ${name}. Please create it with CreateIndexedDB first.`);
    }

    debugVerbose(`Loading IndexedDB: ${name}`);

    const db = await _loadDatabase(name);
    db.onversionchange = () => db.close();
    return db;
}

/**
 * Run a function with an instance of a database
 * @param name The database's name
 * @param fn An async function taking the database object as the first argument, and returning any data
 * @returns The data returned by the function
 */
export async function WithIndexDB(name: DatabaseName, fn: (arg0: IDBDatabase) => Promise<any>): Promise<any> {
    if (!isCallable(fn))
        throw new Error(`WithIndexDB received non-function variable "fn".`);
    const db = await LoadIndexDB(name);
    let result;
    try {
        result = await fn(db);
    } catch (e) {
        db.close();
        throw e;
    };

    db.close();
    return result;
}

/**
 * Creates an object store. Only callable within CreateIndexedDB.
 * @param {IDBDatabase} db The database object 
 * @param {string} name The object store name (case-insensitive) 
 */
export function CreateObjectStore(db: IDBDatabase, name: string): IDBObjectStore {
    debugVerbose(`IndexedDB(${db.name}): Creating object store "${name}"`);
    return db.createObjectStore(name.toLowerCase(), {
        keyPath: "meta.id"
    });
}



// ---- Object Store ----

export function LoadObjectStore(db: IDBDatabase, name: string): ObjectStore {
    if (!db.objectStoreNames.contains(name.toLowerCase())) {
        throw new Error(`Object store "${name}" does not exist.`);
    }

    debugVerbose(`IndexedDB(${db.name}): Loading object store "${name}"`);
    const o = new ObjectStore(db, name.toLowerCase());
    return o;
}

class ObjectStore {
    private db: IDBDatabase;
    private name: string;
    private persistence: IDBTransactionDurability;

    constructor (db: IDBDatabase, name: string) {
        this.db = db
        this.name = name;
        this.persistence = "default";
    }

    /**
     * Configure the ObjectStore instance
     */
    Configure(options: {
        persistence?: IDBTransactionDurability
    }) {
        this.persistence = options.persistence ?? this.persistence;
    }

    private getStore(perms: IDBTransactionMode = "readwrite", persistence: IDBTransactionDurability = this.persistence): [IDBObjectStore, IDBTransaction] {
        const tr = this.db.transaction(
            this.name,
            perms,
            {
                durability: persistence
            }
        );
        
        return [tr.objectStore(this.name), tr];
    }

    /**
     * Insert a row of data, and wait until it's fully inserted.
     * @param data The row of data to insert.
     * @returns The metadata of the created row, usable to select the row later.
     */
    async AddData(data: Record<any, unknown>): Promise<RowMeta> {
        const targetMeta = {
            id: crypto.randomUUID()
        }
        const [str, tr] = this.getStore('readwrite');
        const result = str.add({
            ...data,
            meta: targetMeta
        });

        return new Promise((r, f) => {
            tr.oncomplete = () => r(targetMeta);
            tr.onabort = () => f(result.error ?? tr.error ?? new DOMException("Unknown error (?) in RoValra indexeddb:getdb", "AbortError"))
        });
    }

    /**
     * Insert a row of data, and return immediately.
     * @param data The row of data to insert.
     * @returns The metadata of the created row, usable to select the row later.
     */
    AddDataSync(data: Record<any, unknown>): RowMeta {
        const targetMeta = {
            id: crypto.randomUUID()
        }
        const [str, tr] = this.getStore('readwrite', 'strict');
        str.add({
            ...data,
            meta: targetMeta
        });
        return targetMeta;
    }

    /**
     * Insert a row of data without preprocessing, and wait until it's fully inserted.
     * @param data The row of data to insert.
     */
    async AddDataRaw(data: Record<any, unknown>): Promise<void> {
        const [str, tr] = this.getStore('readwrite');
        const result = str.add(data);

        return new Promise((r, f) => {
            tr.oncomplete = () => r(undefined);
            tr.onabort = () => f(result.error ?? tr.error ?? new DOMException("Unknown error (?) in RoValra indexeddb:getdb", "AbortError"));
        });
    }

    /**
     * Mutate/Replace a row of data
     * @param data The new version of the row of data.
     * @param meta The metadata used to select the row (returned by AddData and AddDataSync)
     */
    MutateRow(data: Record<any, unknown>, meta: RowMeta): Promise<void> {
        const [str, tr] = this.getStore('readwrite');
        const result = str.put({
            ...data,
            meta: meta
        });

        return new Promise((r, f) => {
            tr.oncomplete = () => r(undefined);
            tr.onabort = () => f(result.error ?? tr.error ?? new DOMException("Unknown error (?) in RoValra indexeddb:getdb", "AbortError"))
        })
    }

    /**
     * Read a row of data.
     * @param meta The metadata used to select the row (returned by AddData and AddDataSync)
     * @returns 
     */
    ReadRow(meta: RowMeta): Promise<unknown> {
        const request = this.getStore("readonly")[0].get(meta.id as any);

        return new Promise((r, f) => {
            request.onsuccess = () => {
                const row = request.result;
                r(row);
            }
            request.onerror = () => {
                f(request.error);
            }
        })
    }

    /**
     * Read multiple rows of data.
     * @param count The number of rows to read. 
     * @returns An array of the rows of data returned by the query.
     */
    ReadStore(count?: number, queryOrOptions?: IDBValidKey | IDBKeyRange | null | undefined): Promise<unknown[]> {
        const request = this.getStore("readonly")[0].getAll(queryOrOptions, count);

        return new Promise((r, f) => {
            request.onsuccess = () => {
                const data = request.result;
                r(data);
            }
            request.onerror = () => f(request.error);
        })
    }

    /**
     * Delete a row of data.
     * @param meta The metadata used to select the row (returned by AddData and AddDataSync)
     * @returns 
     */
    DeleteRow(meta: RowMeta): Promise<void> {
        const [str, tr] = this.getStore('readwrite', "strict");
        const req = str.delete(meta.id);

        return new Promise((r, f) => {
            tr.oncomplete = () => r();
            tr.onabort = () => f(new DOMException(`Failed to delete row (id=${meta.id}).`, "AbortError"));
        })
    }
}
