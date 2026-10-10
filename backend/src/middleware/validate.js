const httpError = require('../utils/httpError');

function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['body', 'params', 'query']) {
      if (!schemas[key]) {
        continue;
      }
      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        return next(httpError(
          400,
          'VALIDATION_ERROR',
          result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        ));
      }
      if (key === 'query') {
        req.validatedQuery = result.data;
      } else {
        req[key] = result.data;
      }
    }
    return next();
  };
}

module.exports = validate;
