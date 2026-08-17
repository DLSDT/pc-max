/**
 * Minimal ambient types for `embedded-postgres` (dev-only dependency used by
 * the integration tests). Full API surface is not needed here.
 */
declare module 'embedded-postgres' {
  interface EmbeddedPostgresOptions {
    databaseDir?: string;
    user?: string;
    password?: string;
    port?: number;
    persistent?: boolean;
    authMethod?: 'scram-sha-256' | 'password' | 'md5';
    initdbFlags?: string[];
    postgresFlags?: string[];
    createPostgresUser?: boolean;
    onLog?: (message: string) => void;
    onError?: (messageOrError: string | Error | unknown) => void;
  }

  class EmbeddedPostgres {
    constructor(options?: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
    getPgClient(): import('pg').Client;
  }

  export default EmbeddedPostgres;
}
