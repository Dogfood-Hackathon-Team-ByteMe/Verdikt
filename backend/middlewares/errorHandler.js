/**
 * Central error handling.
 *
 * Services throw plain Errors carrying a `statusCode`; anything without one is
 * a bug and becomes a 500.
 */

/** Translate driver/ODM errors into the status the client should actually see. */
const classify = (err) => {
	// Mongoose schema validation.
	if (err.name === 'ValidationError') {
		return { status: 400, error: 'ValidationError', message: Object.values(err.errors || {}).map((e) => e.message).join('; ') || err.message };
	}
	// A malformed ObjectId in the URL is a bad request, not a server fault.
	if (err.name === 'CastError') {
		return { status: 400, error: 'BadRequest', message: `Invalid ${err.path}: ${err.value}` };
	}
	// Unique index violation, e.g. duplicate email or a second ballot from the
	// same judge on the same project.
	if (err.code === 11000) {
		return { status: 409, error: 'Conflict', message: 'That record already exists' };
	}
	return null;
};

export const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
	const mapped = classify(err);
	const statusCode = mapped ? mapped.status : err.statusCode || 500;

	// Only log genuine server faults. 4xx responses are the API working as
	// designed (a rejected login, a forbidden action) and logging them as
	// "unhandled" buries the real failures in noise.
	if (statusCode >= 500) {
		console.error(`${req.method} ${req.originalUrl} ->`, err);
	}

	// A rate limiter says how long to wait; without the header a client can
	// only guess, and guessing means retrying immediately.
	if (statusCode === 429 && err.retryAfter) {
		res.set('Retry-After', String(err.retryAfter));
	}

	res.status(statusCode).json({
		success: false,
		error: mapped ? mapped.error : statusCode === 429 ? 'TooManyRequests' : err.name || 'InternalServerError',
		// Never leak an internal exception message on a 500.
		message: statusCode >= 500 ? 'An unexpected error occurred' : mapped ? mapped.message : err.message,
	});
};

export const notFoundHandler = (req, res) => {
	res.status(404).json({
		success: false,
		error: 'NotFound',
		message: `Route ${req.method} ${req.originalUrl} not found`,
	});
};
