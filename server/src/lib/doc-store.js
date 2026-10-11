// Escritura única de documentos del almacén: sort_at se deriva de data.at (consulta por rango, Task 5).
export async function upsertDoc(q, path, data, now) {
  const parent = path.slice(0, path.lastIndexOf('/'));
  await q(
    `insert into docs (path, parent, data, updated_at, sort_at) values ($1, $2, $3::jsonb, $4, $5)
     on conflict (path) do update set data = excluded.data, updated_at = excluded.updated_at, sort_at = excluded.sort_at`,
    [path, parent, JSON.stringify(data), now, typeof data.at === 'number' ? data.at : null],
  );
}
