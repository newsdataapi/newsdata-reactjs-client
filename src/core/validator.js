// Client-side parameter validation and normalization, mirroring the official
// Python/PHP clients:
//   - keys are lowercased (the API is case-insensitive);
//   - null/undefined values are dropped;
//   - arrays are comma-joined; booleans become '1' / '0';
//   - `size` must be an integer within bounds;
//   - `sentiment_score` must be numeric and requires `sentiment`;
//   - mutually-exclusive groups are rejected;
//   - unknown parameters for the endpoint are rejected;
//   - `rawQuery`, when present, must be the only parameter and is parsed and
//     checked against the endpoint's allowed keys.
//
// Returns a plain object mapping parameter name to string value.

import {
  FILTERS,
  BOOL_PARAMS,
  INT_PARAMS,
  FLOAT_PARAMS,
  MUTEX_GROUPS,
  REQUIRES_DATE_RANGE,
  SIZE_MIN,
  SIZE_MAX,
} from './constants.js';
import { NewsdataValidationError } from './errors.js';

/**
 * @param {string} endpoint  One of the keys in FILTERS.
 * @param {object} params    Raw user parameters (control keys already stripped).
 * @param {string|null} [rawQuery]
 * @returns {Record<string,string>}
 */
export function validateParams(endpoint, params = {}, rawQuery = null) {
  const allowed = FILTERS[endpoint];
  if (!allowed) {
    throw new NewsdataValidationError(`Unknown endpoint: ${endpoint}`);
  }

  // Lowercase keys; the API is case-insensitive and our maps are lower.
  const lowered = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    lowered[String(key).toLowerCase()] = value;
  }

  // rawQuery is mutually exclusive with every other parameter.
  if (rawQuery !== null && rawQuery !== undefined) {
    const conflicting = Object.keys(lowered).sort();
    if (conflicting.length > 0) {
      throw new NewsdataValidationError(
        `rawQuery cannot be combined with other parameters; got rawQuery and [${conflicting.join(', ')}]`,
        'rawQuery',
      );
    }
    return parseRawQuery(rawQuery, allowed);
  }

  // Count endpoints require an explicit date range.
  if (REQUIRES_DATE_RANGE.includes(endpoint)) {
    for (const required of ['from_date', 'to_date']) {
      if (lowered[required] === undefined || lowered[required] === '') {
        throw new NewsdataValidationError(
          `${required} is required for the ${endpoint} endpoint`,
          required,
        );
      }
    }
  }

  checkMutex(lowered);

  if (lowered.sentiment_score !== undefined && lowered.sentiment === undefined) {
    throw new NewsdataValidationError(
      'sentiment_score requires sentiment to be set',
      'sentiment_score',
    );
  }

  const validated = {};
  for (const [param, value] of Object.entries(lowered)) {
    if (!allowed.includes(param)) {
      throw new NewsdataValidationError(
        `Unsupported parameter for the ${endpoint} endpoint: ${param}`,
        param,
      );
    }
    validated[param] = coerce(param, value);
  }
  return validated;
}

function checkMutex(params) {
  for (const group of MUTEX_GROUPS) {
    const set = group.filter((name) => params[name] !== undefined);
    if (set.length > 1) {
      throw new NewsdataValidationError(
        `these parameters are mutually exclusive: [${set.join(', ')}]`,
        set[0],
      );
    }
  }
}

function coerce(param, value) {
  if (BOOL_PARAMS.includes(param)) return coerceBool(param, value);
  if (INT_PARAMS.includes(param)) return coerceInt(param, value);
  if (FLOAT_PARAMS.includes(param)) return coerceFloat(param, value);
  return coerceString(param, value);
}

function coerceBool(param, value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value === 0 || value === 1) return String(value);
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes'].includes(v)) return '1';
    if (['0', 'false', 'no'].includes(v)) return '0';
  }
  throw new NewsdataValidationError(`${param} must be a boolean`, param);
}

function coerceInt(param, value) {
  let int;
  if (typeof value === 'number' && Number.isInteger(value)) {
    int = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    int = Number(value);
  } else {
    throw new NewsdataValidationError(`${param} must be an integer`, param);
  }
  if (param === 'size' && (int < SIZE_MIN || int > SIZE_MAX)) {
    throw new NewsdataValidationError(
      `size must be between ${SIZE_MIN} and ${SIZE_MAX} (got ${int})`,
      'size',
    );
  }
  return String(int);
}

function coerceFloat(param, value) {
  if (typeof value === 'boolean' || value === '' || Number.isNaN(Number(value))) {
    throw new NewsdataValidationError(`${param} must be a number`, param);
  }
  return String(value);
}

function coerceString(param, value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (
          item === null
          || item === undefined
          || typeof item === 'boolean'
          || typeof item === 'object'
        ) {
          throw new NewsdataValidationError(`all items in ${param} must be strings`, param);
        }
        return String(item);
      })
      .join(',');
  }
  if (typeof value === 'boolean' || (typeof value === 'object' && value !== null)) {
    throw new NewsdataValidationError(`${param} must be a string or array of strings`, param);
  }
  return String(value);
}

/**
 * Parse a `rawQuery` (a query-string fragment or a full URL) into a validated
 * parameter map.
 *
 * @param {string} rawQuery
 * @param {string[]} allowed
 * @returns {Record<string,string>}
 */
function parseRawQuery(rawQuery, allowed) {
  if (typeof rawQuery !== 'string') {
    throw new NewsdataValidationError('rawQuery must be a string', 'rawQuery');
  }
  if (rawQuery === '') {
    throw new NewsdataValidationError('rawQuery must be a non-empty string', 'rawQuery');
  }

  let queryString = rawQuery;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawQuery)) {
    queryString = new URL(rawQuery).search;
  }
  const search = new URLSearchParams(queryString.replace(/^\?/, ''));

  const result = {};
  for (const [key, value] of search.entries()) {
    const normalized = key.trim().toLowerCase();
    if (normalized === '') continue;
    if (normalized === 'apikey') continue; // supplied by the client
    if (!allowed.includes(normalized)) {
      throw new NewsdataValidationError(`Unknown parameter in rawQuery: ${key}`, key);
    }
    if (value === '') {
      throw new NewsdataValidationError(`Parameter ${key} in rawQuery must have a value`, key);
    }
    result[normalized] = value;
  }
  return result;
}
