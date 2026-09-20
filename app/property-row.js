/* Property ↔ Postgres row mapping. Omit empty optional columns so Add home
   still works if a later migration has not been applied yet. */

export const OPTIONAL_PROPERTY_COLUMNS = [
  'thumbnail_path',
  'beds',
  'baths',
  'sqft',
  'year_built',
  'property_type',
  'description',
  'utility_electric',
  'utility_gas',
  'utility_water',
  'utility_notes',
  'trash_schedule',
  'trash_notes'
];

function optionalNumber(value) {
  if (value === '' || value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function optionalText(value) {
  return String(value ?? '').trim();
}

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

  const beds = optionalNumber(property.beds);
  const baths = optionalNumber(property.baths);
  const sqft = optionalNumber(property.sqft);
  const yearBuilt = optionalNumber(property.yearBuilt ?? property.year_built);
  if (beds != null) row.beds = beds;
  if (baths != null) row.baths = baths;
  if (sqft != null) row.sqft = Math.round(sqft);
  if (yearBuilt != null) row.year_built = Math.round(yearBuilt);

  const type = optionalText(property.propertyType ?? property.property_type);
  const description = optionalText(property.description);
  const utilityElectric = optionalText(property.utilityElectric ?? property.utility_electric);
  const utilityGas = optionalText(property.utilityGas ?? property.utility_gas);
  const utilityWater = optionalText(property.utilityWater ?? property.utility_water);
  const utilityNotes = optionalText(property.utilityNotes ?? property.utility_notes);
  const trashSchedule = optionalText(property.trashSchedule ?? property.trash_schedule);
  const trashNotes = optionalText(property.trashNotes ?? property.trash_notes);
  if (type) row.property_type = type;
  if (description) row.description = description;
  if (utilityElectric) row.utility_electric = utilityElectric;
  if (utilityGas) row.utility_gas = utilityGas;
  if (utilityWater) row.utility_water = utilityWater;
  if (utilityNotes) row.utility_notes = utilityNotes;
  if (trashSchedule) row.trash_schedule = trashSchedule;
  if (trashNotes) row.trash_notes = trashNotes;
  return row;
}

export function withoutThumbnailPath(row) {
  const next = { ...(row || {}) };
  delete next.thumbnail_path;
  return next;
}

export function withoutOptionalPropertyColumns(row) {
  const next = { ...(row || {}) };
  OPTIONAL_PROPERTY_COLUMNS.forEach(column => {
    delete next[column];
  });
  return next;
}
