'use strict';

/**
 * Zod schema validation middleware factory.
 * Usage: validate(MyZodSchema) — validates req.body by default.
 *        validate(MyZodSchema, 'query') — validates req.query.
 *        validate(MyZodSchema, 'params') — validates req.params.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Replace with parsed (coerced) data
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
