type WorkerEnv = Env & {
	pick_your_favorite: D1Database;
};

type WinnerRow = {
	id: number;
	menu: string;
	card_id: number;
	card_name: string;
	description: string | null;
	image: string | null;
	created_at: string;
};

type WinnerSummaryRow = {
	card_id: number;
	card_name: string;
	description: string | null;
	image: string | null;
	wins: number;
	latest_win_at: string;
};

type WinnerRequestBody = {
	menu?: unknown;
	cardId?: unknown;
	card_id?: unknown;
	cardName?: unknown;
	card_name?: unknown;
	description?: unknown;
	image?: unknown;
};

type QuizWordRow = {
	id: number;
	subject_id: number | null;
	abbreviation: string;
	full_name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
};

type QuizWordRequestBody = {
	id?: unknown;
	subjectId?: unknown;
	subject_id?: unknown;
	abbreviation?: unknown;
	fullName?: unknown;
	full_name?: unknown;
	description?: unknown;
};

type SubjectRow = {
	id: number;
	title: string;
	description: string | null;
	created_at: string;
	updated_at: string;
};

type SubjectRequestBody = {
	id?: unknown;
	title?: unknown;
	description?: unknown;
};

const jsonHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, init: ResponseInit = {}) {
	return Response.json(data, {
		...init,
		headers: {
			...jsonHeaders,
			...init.headers,
		},
	});
}

function error(message: string, status = 400) {
	return json({ error: message }, { status });
}

function optionalString(value: unknown) {
	if (value === undefined || value === null) {
		return null;
	}

	return typeof value === 'string' ? value.trim() || null : null;
}

function requiredString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function parseCardId(value: unknown) {
	if (typeof value === 'number' && Number.isInteger(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isInteger(parsed) ? parsed : null;
	}

	return null;
}

function parseOptionalInteger(value: unknown) {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	return parseCardId(value);
}

async function getWinners(request: Request, env: WorkerEnv) {
	const url = new URL(request.url);
	const menu = requiredString(url.searchParams.get('menu'));

	if (!menu) {
		return error('menu query parameter is required');
	}

	const { results } = await env.pick_your_favorite
		.prepare(
			`SELECT id, menu, card_id, card_name, description, image, created_at
			 FROM winners
			 WHERE menu = ?
			 ORDER BY created_at DESC, id DESC`,
		)
		.bind(menu)
		.run<WinnerRow>();

	return json({ winners: results });
}

async function createWinner(request: Request, env: WorkerEnv) {
	let body: WinnerRequestBody;

	try {
		body = (await request.json()) as WinnerRequestBody;
	} catch {
		return error('Request body must be valid JSON');
	}

	const menu = requiredString(body.menu);
	const cardId = parseCardId(body.cardId ?? body.card_id);
	const cardName = requiredString(body.cardName ?? body.card_name);
	const description = optionalString(body.description);
	const image = optionalString(body.image);

	if (!menu) {
		return error('menu is required');
	}

	if (cardId === null) {
		return error('cardId is required and must be an integer');
	}

	if (!cardName) {
		return error('cardName is required');
	}

	const result = await env.pick_your_favorite
		.prepare(
			`INSERT INTO winners (menu, card_id, card_name, description, image)
			 VALUES (?, ?, ?, ?, ?)
			 RETURNING id, menu, card_id, card_name, description, image, created_at`,
		)
		.bind(menu, cardId, cardName, description, image)
		.first<WinnerRow>();

	return json({ winner: result }, { status: 201 });
}

async function getWinnerSummary(request: Request, env: WorkerEnv) {
	const url = new URL(request.url);
	const menu = requiredString(url.searchParams.get('menu'));

	if (!menu) {
		return error('menu query parameter is required');
	}

	const { results } = await env.pick_your_favorite
		.prepare(
			`SELECT
				card_id,
				card_name,
				description,
				image,
				COUNT(*) AS wins,
				MAX(created_at) AS latest_win_at
			 FROM winners
			 WHERE menu = ?
			 GROUP BY card_id, card_name, description, image
			 ORDER BY wins DESC, latest_win_at DESC, card_id ASC`,
		)
		.bind(menu)
		.run<WinnerSummaryRow>();

	return json({ summary: results });
}

async function getQuizWords(_request: Request, env: WorkerEnv) {
	const url = new URL(_request.url);
	const subjectId = parseOptionalInteger(url.searchParams.get('subjectId') ?? url.searchParams.get('subject_id'));

	if (subjectId === null && (url.searchParams.has('subjectId') || url.searchParams.has('subject_id'))) {
		return error('subjectId must be an integer');
	}

	const statement =
		subjectId === null
			? env.pick_your_favorite.prepare(
					`SELECT id, subject_id, abbreviation, full_name, description, created_at, updated_at
					 FROM quiz_words
					 ORDER BY created_at DESC, id DESC`,
				)
			: env.pick_your_favorite
					.prepare(
						`SELECT id, subject_id, abbreviation, full_name, description, created_at, updated_at
						 FROM quiz_words
						 WHERE subject_id = ?
						 ORDER BY created_at DESC, id DESC`,
					)
					.bind(subjectId);

	const { results } = await statement.run<QuizWordRow>();

	return json({ words: results });
}

async function createQuizWord(request: Request, env: WorkerEnv) {
	let body: QuizWordRequestBody;

	try {
		body = (await request.json()) as QuizWordRequestBody;
	} catch {
		return error('Request body must be valid JSON');
	}

	const id = parseOptionalInteger(body.id);
	const abbreviation = requiredString(body.abbreviation).toUpperCase();
	const subjectId = parseOptionalInteger(body.subjectId ?? body.subject_id);
	const fullName = requiredString(body.fullName ?? body.full_name);
	const description = optionalString(body.description);

	if (!abbreviation) {
		return error('abbreviation is required');
	}

	if (!fullName) {
		return error('fullName is required');
	}

	if (subjectId === null) {
		return error('subjectId is required and must be an integer');
	}

	if (id === null && body.id !== undefined) {
		return error('id must be an integer');
	}

	if (id !== null) {
		const result = await env.pick_your_favorite
			.prepare(
				`UPDATE quiz_words
				 SET subject_id = ?, abbreviation = ?, full_name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?
				 RETURNING id, subject_id, abbreviation, full_name, description, created_at, updated_at`,
			)
			.bind(subjectId, abbreviation, fullName, description, id)
			.first<QuizWordRow>();

		if (!result) {
			return error('quiz word not found', 404);
		}

		return json({ word: result });
	}

	const result = await env.pick_your_favorite
		.prepare(
			`INSERT INTO quiz_words (subject_id, abbreviation, full_name, description)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(subject_id, abbreviation) DO UPDATE SET
				subject_id = excluded.subject_id,
				full_name = excluded.full_name,
				description = excluded.description,
				updated_at = CURRENT_TIMESTAMP
			 RETURNING id, subject_id, abbreviation, full_name, description, created_at, updated_at`,
		)
		.bind(subjectId, abbreviation, fullName, description)
		.first<QuizWordRow>();

	return json({ word: result }, { status: 201 });
}

async function deleteQuizWord(request: Request, env: WorkerEnv) {
	const url = new URL(request.url);
	const id = parseOptionalInteger(url.searchParams.get('id'));

	if (id === null) {
		return error('id query parameter is required and must be an integer');
	}

	const result = await env.pick_your_favorite
		.prepare(
			`DELETE FROM quiz_words
			 WHERE id = ?
			 RETURNING id, subject_id, abbreviation, full_name, description, created_at, updated_at`,
		)
		.bind(id)
		.first<QuizWordRow>();

	if (!result) {
		return error('quiz word not found', 404);
	}

	return json({ word: result });
}

async function getSubjects(_request: Request, env: WorkerEnv) {
	const { results } = await env.pick_your_favorite
		.prepare(
			`SELECT id, title, description, created_at, updated_at
			 FROM subjects
			 ORDER BY title ASC, id ASC`,
		)
		.run<SubjectRow>();

	return json({ subjects: results });
}

async function createOrUpdateSubject(request: Request, env: WorkerEnv) {
	let body: SubjectRequestBody;

	try {
		body = (await request.json()) as SubjectRequestBody;
	} catch {
		return error('Request body must be valid JSON');
	}

	const id = parseOptionalInteger(body.id);
	const title = requiredString(body.title);
	const description = optionalString(body.description);

	if (id === null && body.id !== undefined) {
		return error('id must be an integer');
	}

	if (!title) {
		return error('title is required');
	}

	if (id !== null) {
		const result = await env.pick_your_favorite
			.prepare(
				`UPDATE subjects
				 SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?
				 RETURNING id, title, description, created_at, updated_at`,
			)
			.bind(title, description, id)
			.first<SubjectRow>();

		if (!result) {
			return error('subject not found', 404);
		}

		return json({ subject: result });
	}

	const result = await env.pick_your_favorite
		.prepare(
			`INSERT INTO subjects (title, description)
			 VALUES (?, ?)
			 ON CONFLICT(title) DO UPDATE SET
				description = excluded.description,
				updated_at = CURRENT_TIMESTAMP
			 RETURNING id, title, description, created_at, updated_at`,
		)
		.bind(title, description)
		.first<SubjectRow>();

	return json({ subject: result }, { status: 201 });
}

async function deleteSubject(request: Request, env: WorkerEnv) {
	const url = new URL(request.url);
	const id = parseOptionalInteger(url.searchParams.get('id'));

	if (id === null) {
		return error('id query parameter is required and must be an integer');
	}

	const result = await env.pick_your_favorite
		.prepare(
			`DELETE FROM subjects
			 WHERE id = ?
			 RETURNING id, title, description, created_at, updated_at`,
		)
		.bind(id)
		.first<SubjectRow>();

	if (!result) {
		return error('subject not found', 404);
	}

	return json({ subject: result });
}

export default {
	async fetch(request, env): Promise<Response> {
		const workerEnv = env as WorkerEnv;
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: jsonHeaders });
		}

		if (url.pathname === '/api/winners' && request.method === 'GET') {
			return getWinners(request, workerEnv);
		}

		if (url.pathname === '/api/winners' && request.method === 'POST') {
			return createWinner(request, workerEnv);
		}

		if (url.pathname === '/api/winners/summary' && request.method === 'GET') {
			return getWinnerSummary(request, workerEnv);
		}

		if (url.pathname === '/api/quiz-words' && request.method === 'GET') {
			return getQuizWords(request, workerEnv);
		}

		if (url.pathname === '/api/quiz-words' && request.method === 'POST') {
			return createQuizWord(request, workerEnv);
		}

		if (url.pathname === '/api/quiz-words' && request.method === 'DELETE') {
			return deleteQuizWord(request, workerEnv);
		}

		if (url.pathname === '/api/subjects' && request.method === 'GET') {
			return getSubjects(request, workerEnv);
		}

		if (url.pathname === '/api/subjects' && request.method === 'POST') {
			return createOrUpdateSubject(request, workerEnv);
		}

		if (url.pathname === '/api/subjects' && request.method === 'DELETE') {
			return deleteSubject(request, workerEnv);
		}

		return error('Not found', 404);
	},
} satisfies ExportedHandler<Env>;
