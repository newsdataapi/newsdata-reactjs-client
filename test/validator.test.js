import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateParams } from '../src/core/validator.js';
import { NewsdataValidationError } from '../src/core/errors.js';
import { SIZE_MAX } from '../src/core/constants.js';

test('arrays are comma-joined', () => {
  assert.deepEqual(validateParams('latest', { country: ['us', 'gb'] }), { country: 'us,gb' });
});

test('booleans are coerced to 1/0', () => {
  assert.deepEqual(
    validateParams('latest', { full_content: true, image: false }),
    { full_content: '1', image: '0' },
  );
});

test('keys are lowercased', () => {
  assert.deepEqual(validateParams('latest', { qInTitle: 'hi' }), { qintitle: 'hi' });
});

test('null/undefined values are dropped', () => {
  assert.deepEqual(validateParams('latest', { q: 'x', country: null, language: undefined }), { q: 'x' });
});

test('size upper bound is rejected', () => {
  assert.throws(() => validateParams('latest', { size: SIZE_MAX + 1 }), NewsdataValidationError);
});

test('size within bounds is accepted', () => {
  assert.deepEqual(validateParams('latest', { size: 50 }), { size: '50' });
});

test('mutually-exclusive params are rejected', () => {
  assert.throws(() => validateParams('latest', { q: 'a', qInTitle: 'b' }), NewsdataValidationError);
});

test('unknown parameter is rejected', () => {
  assert.throws(() => validateParams('latest', { nope: 'x' }), NewsdataValidationError);
});

test('crypto rejects country', () => {
  assert.throws(() => validateParams('crypto', { country: 'us' }), NewsdataValidationError);
});

test('sentiment_score requires sentiment', () => {
  assert.throws(() => validateParams('latest', { sentiment_score: 0.5 }), NewsdataValidationError);
});

test('sentiment_score with sentiment is accepted', () => {
  assert.deepEqual(
    validateParams('latest', { sentiment: 'positive', sentiment_score: 0.5 }),
    { sentiment: 'positive', sentiment_score: '0.5' },
  );
});

test('count requires date range', () => {
  assert.throws(() => validateParams('count', { q: 'x' }), NewsdataValidationError);
});

test('count with dates is accepted', () => {
  assert.deepEqual(
    validateParams('count', { from_date: '2024-01-01', to_date: '2024-01-02' }),
    { from_date: '2024-01-01', to_date: '2024-01-02' },
  );
});

test('rawQuery is parsed and validated', () => {
  assert.deepEqual(
    validateParams('latest', {}, 'q=foo&country=us'),
    { q: 'foo', country: 'us' },
  );
});

test('rawQuery rejects other params', () => {
  assert.throws(() => validateParams('latest', { country: 'us' }, 'q=foo'), NewsdataValidationError);
});

test('rawQuery rejects unknown keys', () => {
  assert.throws(() => validateParams('latest', {}, 'bogus=1'), NewsdataValidationError);
});

test('rawQuery ignores embedded apikey', () => {
  assert.deepEqual(validateParams('latest', {}, 'apikey=secret&q=foo'), { q: 'foo' });
});

test('rawQuery accepts a full URL', () => {
  assert.deepEqual(
    validateParams('latest', {}, 'https://newsdata.io/api/1/latest?q=foo&language=en'),
    { q: 'foo', language: 'en' },
  );
});

test('validation error exposes the param name', () => {
  try {
    validateParams('latest', { size: 999 });
    assert.fail('expected NewsdataValidationError');
  } catch (err) {
    assert.equal(err.param, 'size');
  }
});
