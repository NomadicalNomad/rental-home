/* Property ↔ Postgres row mapping. Omit empty thumbnail_path so Add home
   still works if that column has not been applied yet. */

export function toPropertyRow(property, accountId) {
  const row = {
    id: property.id,
    account_id: accountId,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    status: property.status,
    tenant_name: property.tenantName || '',
    phone: property.phone || '',
    email: property.email || '',
    rent: property.rent || '',
    notes: property.notes || '',
    created_at: property.createdAt,
    updated_at: property.updatedAt
  };
  const thumb = String(property.thumbnailPath || property.thumbnail_path || '').trim();
  if (thumb) row.thumbnail_path = thumb;
  return row;
}

export function withoutThumbnailPath(row) {
  const next = { ...(row || {}) };
  delete next.thumbnail_path;
  return next;
}
