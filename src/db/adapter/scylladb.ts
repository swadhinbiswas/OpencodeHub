import { CassandraAdapter } from "./cassandra";

// ScyllaDB is Cassandra-compatible at the protocol layer.
export class ScyllaDBAdapter extends CassandraAdapter {}
