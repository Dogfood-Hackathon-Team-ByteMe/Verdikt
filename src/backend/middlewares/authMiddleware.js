import Session from "../models/Session.js";

export const authenticate = async (req, res, next) => {
	try {
		// Idempotent: app.js runs this once for the whole /api tree so the rate
		// limiter can count a signed-in caller against their account, and every
		// route still names it for its own sake. Without this guard the second
		// call would repeat the session lookup on every request.
		// `sessionDoc` is the sentinel because every branch below sets it,
		// including the anonymous ones -- `user` alone would be null for a
		// signed-out visitor and look like "not resolved yet".
		if (req.sessionDoc !== undefined) return next();

		// Parse cookie header: "session=abc123"
		const cookieHeader = req.headers.cookie;
		if (!cookieHeader) {
			req.user = null;
			req.sessionDoc = null;
			return next();
		}

		const cookies = Object.fromEntries(
			cookieHeader.split(";").map((c) => {
				const [key, ...val] = c.trim().split("=");
				return [key, val.join("=")];
			}),
		);

		const token = cookies.session;
		if (!token) {
			req.user = null;
			req.sessionDoc = null;
			return next();
		}

		// Exclude the password hash: req.user is read by every downstream
		// handler and some of them serialise it straight back to the client.
		const session = await Session.findOne({ token }).populate("userId", "-password");
		if (!session || !session.userId) {
			req.user = null;
			req.sessionDoc = null;
			return next();
		}

		req.user = session.userId; // populated User document
		req.sessionDoc = session;
		req.sessionToken = token;
		next();
	} catch (error) {
		req.user = null;
		req.sessionDoc = null;
		next();
	}
};

// Middleware that REQUIRES authentication — returns 401 if not authenticated
export const requireAuth = (req, res, next) => {
	if (!req.user || !req.sessionDoc) {
		return res.status(401).json({
			success: false,
			error: "Unauthorized",
			message: "Authentication required",
		});
	}
	next();
};
