import * as userService from "../services/UserService.js";

export const create = async (req, res, next) => {
	try {
		const user = await userService.createUser(req.body, req.user);
		res.status(201).json({
			success: true,
			data: user,
			message: "User created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const user = await userService.getUserById(req.params.id);
		res.json({
			success: true,
			data: user,
			message: "User retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const users = await userService.getAllUsers();
		res.json({
			success: true,
			data: users,
			message: "Users retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const user = await userService.updateUser(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: user,
			message: "User updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await userService.deleteUser(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "User deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getEventParticipants = async (req, res, next) => {
	try {
		const users = await userService.getEventParticipants(
			req.params.id,
			req.user,
		);
		res.json({
			success: true,
			data: users,
			message: "Event participants retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const search = async (req, res, next) => {
	try {
		const users = await userService.searchUsers(req.query.q);
		res.json({ success: true, data: users });
	} catch (error) { next(error); }
};
