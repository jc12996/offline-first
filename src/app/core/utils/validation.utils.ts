export function isValidString(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidId(id: any): id is string {
  return typeof id === 'string' && id.length > 0;
}

export function hasRequiredFields(obj: any, fields: string[]): boolean {
  return fields.every(function(field) {
    return obj && obj[field] !== undefined && obj[field] !== null;
  });
}

export function isFormValid(formData: { clientName: string; note: string }): boolean {
  return isValidString(formData.clientName) && isValidString(formData.note);
}

