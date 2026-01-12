import { useState, useEffect } from 'react';

/**
 * EnhancementForm - Dynamic form renderer based on JSON schema
 *
 * Supports:
 * - Object schemas with property fields
 * - Array schemas for repeatable items (e.g., Additional Insureds)
 * - Field types: string, number, text, select, currency, checkbox
 */
export default function EnhancementForm({
  schema,
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
  showCancel = true,
}) {
  const [formData, setFormData] = useState(initialData || {});

  // Reset form when initialData changes
  useEffect(() => {
    setFormData(initialData || {});
  }, [initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Handle different schema types
  const schemaType = schema?.type || 'object';

  if (schemaType === 'array') {
    return (
      <ArrayForm
        schema={schema}
        data={Array.isArray(formData) ? formData : []}
        onChange={setFormData}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        submitLabel={submitLabel}
        isSubmitting={isSubmitting}
        showCancel={showCancel}
      />
    );
  }

  return (
    <ObjectForm
      schema={schema}
      data={formData}
      onChange={setFormData}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel={submitLabel}
      isSubmitting={isSubmitting}
      showCancel={showCancel}
    />
  );
}

/**
 * ObjectForm - Renders a form for object-type schemas
 */
function ObjectForm({
  schema,
  data,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
  showCancel,
}) {
  const properties = schema?.properties || {};

  const handleFieldChange = (fieldName, value) => {
    onChange({ ...data, [fieldName]: value });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {Object.entries(properties).map(([fieldName, fieldSchema]) => (
        <FieldRenderer
          key={fieldName}
          name={fieldName}
          schema={fieldSchema}
          value={data[fieldName]}
          onChange={(val) => handleFieldChange(fieldName, val)}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-sm"
        >
          {submitLabel}
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * ArrayForm - Renders a form for array-type schemas (repeatable items)
 */
function ArrayForm({
  schema,
  data,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
  showCancel,
}) {
  const itemSchema = schema?.items || { type: 'object', properties: {} };
  const minItems = schema?.minItems || 0;

  const addItem = () => {
    const newItem = createEmptyItem(itemSchema);
    onChange([...data, newItem]);
  };

  const removeItem = (index) => {
    if (data.length <= minItems) return;
    const newData = [...data];
    newData.splice(index, 1);
    onChange(newData);
  };

  const updateItem = (index, updatedItem) => {
    const newData = [...data];
    newData[index] = updatedItem;
    onChange(newData);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">
              Entry {index + 1}
            </span>
            {data.length > minItems && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>

          <div className="space-y-2">
            {Object.entries(itemSchema.properties || {}).map(([fieldName, fieldSchema]) => (
              <FieldRenderer
                key={fieldName}
                name={fieldName}
                schema={fieldSchema}
                value={item[fieldName]}
                onChange={(val) => updateItem(index, { ...item, [fieldName]: val })}
              />
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="text-sm text-purple-600 hover:text-purple-800"
      >
        + Add Entry
      </button>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-sm"
        >
          {submitLabel}
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * FieldRenderer - Renders individual form fields based on type
 */
function FieldRenderer({ name, schema, value, onChange }) {
  const type = schema?.type || 'string';
  const title = schema?.title || formatFieldName(name);
  const description = schema?.description;
  const required = schema?.required;
  const defaultValue = schema?.default;

  // Use default value if no value provided
  const fieldValue = value ?? defaultValue ?? '';

  const labelElement = (
    <label className="block text-xs text-gray-600 mb-1">
      {title}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );

  switch (type) {
    case 'select':
      return (
        <div>
          {labelElement}
          <select
            className="form-select text-sm w-full"
            value={fieldValue}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          >
            <option value="">Select...</option>
            {(schema?.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
      );

    case 'number':
      return (
        <div>
          {labelElement}
          <input
            type="number"
            className="form-input text-sm w-full"
            value={fieldValue}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
            required={required}
          />
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
      );

    case 'currency':
      return (
        <div>
          {labelElement}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              className="form-input text-sm w-full pl-6"
              value={fieldValue}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
              required={required}
            />
          </div>
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
      );

    case 'text':
      return (
        <div>
          {labelElement}
          <textarea
            className="form-input text-sm w-full"
            rows={3}
            value={fieldValue}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          />
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
      );

    case 'boolean':
    case 'checkbox':
      return (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(fieldValue)}
              onChange={(e) => onChange(e.target.checked)}
            />
            {title}
          </label>
          {description && <p className="text-xs text-gray-400 mt-1 ml-6">{description}</p>}
        </div>
      );

    case 'string':
    default:
      const maxLength = schema?.maxLength;
      return (
        <div>
          {labelElement}
          <input
            type="text"
            className="form-input text-sm w-full"
            value={fieldValue}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            maxLength={maxLength}
          />
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
      );
  }
}

/**
 * Create an empty item based on schema
 */
function createEmptyItem(itemSchema) {
  const item = {};
  for (const [fieldName, fieldSchema] of Object.entries(itemSchema.properties || {})) {
    if (fieldSchema.default !== undefined) {
      item[fieldName] = fieldSchema.default;
    } else {
      item[fieldName] = '';
    }
  }
  return item;
}

/**
 * Format field name to title case
 */
function formatFieldName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
