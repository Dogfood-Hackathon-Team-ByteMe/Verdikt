/**
 * Auth endpoints. The only place in the codebase that sets or clears the
 * session cookie; everywhere else just reads req.user.
 */
import * as authService from "../services/AuthService.js";

const COOKIE_NAME = "session";

/**
 * Cookie options.
 *
 * httpOnly  - JavaScript cannot read the token, so an XSS bug cannot steal it.
 * sameSite  - 'lax' is right for a same-site SPA. A frontend on a different
 *             site needs 'none' + secure, which needs HTTPS; set
 *             COOKIE_SAMESITE=none only behind TLS.
 * secure    - on in production, off in local dev where there is no HTTPS.
 */
const cookieOptions = (expiresAt) => ({
	httpOnly: true,
	sameSite: process.env.COOKIE_SAMESITE || "lax",
	secure: process.env.NODE_ENV === "production",
	path: "/",
	expires: expiresAt,
});

export const register = async (req, res, next) => {
	try {
		const { user, session } = await authService.register(req.body);
		res.cookie(COOKIE_NAME, session.token, cookieOptions(session.expiresAt));
		res.status(201).json({
			success: true,
			data: user,
			message: "Account created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const login = async (req, res, next) => {
	try {
		const { user, session } = await authService.login(req.body);
		res.cookie(COOKIE_NAME, session.token, cookieOptions(session.expiresAt));
		res.json({
			success: true,
			data: user,
			message: "Signed in successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const logout = async (req, res, next) => {
	try {
		// Delete the row first: clearing only the cookie would leave a token
		// that still works if it was captured.
		await authService.logout(req.sessionToken);
		res.clearCookie(COOKIE_NAME, { path: "/" });
		res.status(204).send();
	} catch (error) {
		next(error);
	}
};

export const me = async (req, res, next) => {
	try {
		const user = await authService.me(req.user._id);
		res.json({
			success: true,
			data: user,
			message: "Current user retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};
