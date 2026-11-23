#!/bin/bash
# Crea un usuario y un esquema por servicio (backend.md §1): `nucleo` (NestJS) e `ia` (F2).
# También crea `brecha_pruebas`, la base desechable de las pruebas de integración.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE nucleo LOGIN PASSWORD '${NUCLEO_DB_PASSWORD}';
  CREATE ROLE ia LOGIN PASSWORD '${IA_DB_PASSWORD}';
  CREATE DATABASE brecha_pruebas OWNER brecha;
SQL

for db in "$POSTGRES_DB" brecha_pruebas; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-SQL
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    CREATE SCHEMA nucleo AUTHORIZATION nucleo;
    CREATE SCHEMA ia AUTHORIZATION ia;
    CREATE EXTENSION IF NOT EXISTS vector SCHEMA ia;
    GRANT CONNECT ON DATABASE $db TO nucleo, ia;
    ALTER ROLE nucleo IN DATABASE $db SET search_path = nucleo;
    ALTER ROLE ia IN DATABASE $db SET search_path = ia, public;
SQL
done
