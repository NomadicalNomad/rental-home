/* Explicitly present optional fields serialize clearing; absent fields remain absent. */

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
    rent: property.rent ?? '',
    notes: property.notes || '',
    created_at: property.createdAt,
    updated_at: property.updatedAt
  };
  const thumb = String(property.thumbnailPath ?? property.thumbnail_path ?? '').trim();
  if ('thumbnailPath' in property || 'thumbnail_path' in property) row.thumbnail_path = thumb || null;

  const beds = optionalNumber(property.beds);
  const baths = optionalNumber(property.baths);
  const sqft = optionalNumber(property.sqft);
  const yearBuilt = optionalNumber(property.yearBuilt ?? property.year_built);
  if ('beds' in property || 'beds' in property) row.beds = beds;
  if ('baths' in property || 'baths' in property) row.baths = baths;
  if ('sqft' in property || 'sqft' in property) row.sqft = sqft;
  if ('yearBuilt' in property || 'year_built' in property) row.year_built = yearBuilt;

  const type = optionalText(property.propertyType ?? property.property_type);
  const description = optionalText(property.description);
  const utilityElectric = optionalText(property.utilityElectric ?? property.utility_electric);
  const utilityGas = optionalText(property.utilityGas ?? property.utility_gas);
  const utilityWater = optionalText(property.utilityWater ?? property.utility_water);
  const utilityNotes = optionalText(property.utilityNotes ?? property.utility_notes);
  const trashSchedule = optionalText(property.trashSchedule ?? property.trash_schedule);
  const trashNotes = optionalText(property.trashNotes ?? property.trash_notes);
  if ('propertyType' in property || 'property_type' in property) row.property_type = type;
  if ('description' in property || 'description' in property) row.description = description;
  if ('utilityElectric' in property || 'utility_electric' in property) row.utility_electric = utilityElectric;
  if ('utilityGas' in property || 'utility_gas' in property) row.utility_gas = utilityGas;
  if ('utilityWater' in property || 'utility_water' in property) row.utility_water = utilityWater;
  if ('utilityNotes' in property || 'utility_notes' in property) row.utility_notes = utilityNotes;
  if ('trashSchedule' in property || 'trash_schedule' in property) row.trash_schedule = trashSchedule;
  if ('trashNotes' in property || 'trash_notes' in property) row.trash_notes = trashNotes;
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
