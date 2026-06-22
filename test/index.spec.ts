import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

type StoredWinner = {
	id: number;
	menu: string;
	card_id: number;
	card_name: string;
	description: string | null;
	image: string | null;
	created_at: string;
};

type StoredQuizWord = {
	id: number;
	subject_id: number | null;
	abbreviation: string;
	full_name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
};

type StoredSubject = {
	id: number;
	title: string;
	description: string | null;
	created_at: string;
	updated_at: string;
};

function createMockEnv(seed: StoredWinner[] = [], quizWordSeed: StoredQuizWord[] = [], subjectSeed: StoredSubject[] = []) {
	const winners = [...seed];
	const quizWords = [...quizWordSeed];
	const subjects = [...subjectSeed];

	const db = {
		prepare(sql: string) {
			let params: unknown[] = [];

			return {
				bind(...values: unknown[]) {
					params = values;
					return this;
				},
				async run() {
					if (sql.includes('FROM subjects')) {
						return {
							results: [...subjects].sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id),
						};
					}

					if (sql.includes('FROM quiz_words')) {
						const filteredWords = sql.includes('WHERE subject_id = ?')
							? quizWords.filter((word) => word.subject_id === Number(params[0]))
							: quizWords;

						return {
							results: [...filteredWords].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
						};
					}

					const menu = String(params[0]);

					if (sql.includes('COUNT(*) AS wins')) {
						const summary = new Map<string, StoredWinner & { wins: number }>();

						for (const winner of winners.filter((item) => item.menu === menu)) {
							const key = [winner.card_id, winner.card_name, winner.description, winner.image].join(':');
							const current = summary.get(key);

							if (current) {
								current.wins += 1;
								current.created_at = current.created_at > winner.created_at ? current.created_at : winner.created_at;
							} else {
								summary.set(key, { ...winner, wins: 1 });
							}
						}

						return {
							results: [...summary.values()]
								.map((winner) => ({
									card_id: winner.card_id,
									card_name: winner.card_name,
									description: winner.description,
									image: winner.image,
									wins: winner.wins,
									latest_win_at: winner.created_at,
								}))
								.sort((a, b) => b.wins - a.wins || b.latest_win_at.localeCompare(a.latest_win_at) || a.card_id - b.card_id),
						};
					}

					return {
						results: winners.filter((item) => item.menu === menu).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
					};
				},
				async first() {
					if (sql.includes('subjects')) {
						const isUpdate = sql.trim().startsWith('UPDATE subjects');
						const isDelete = sql.trim().startsWith('DELETE FROM subjects');
						if (isDelete) {
							const [id] = params;
							const index = subjects.findIndex((subject) => subject.id === Number(id));

							if (index === -1) {
								return null;
							}

							const [deleted] = subjects.splice(index, 1);
							for (let index = quizWords.length - 1; index >= 0; index -= 1) {
								if (quizWords[index].subject_id === deleted.id) {
									quizWords.splice(index, 1);
								}
							}

							return deleted;
						}

						const [title, description, id] = params;

						if (isUpdate) {
							const current = subjects.find((subject) => subject.id === Number(id));

							if (!current) {
								return null;
							}

							current.title = String(title);
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return current;
						}

						const current = subjects.find((subject) => subject.title === String(title));

						if (current) {
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return current;
						}

						const subject: StoredSubject = {
							id: subjects.length + 1,
							title: String(title),
							description: description === null ? null : String(description),
							created_at: '2026-04-27 16:00:00',
							updated_at: '2026-04-27 16:00:00',
						};

						subjects.push(subject);

						return subject;
					}

					if (sql.includes('quiz_words')) {
						const isUpdate = sql.trim().startsWith('UPDATE quiz_words');
						const isDelete = sql.trim().startsWith('DELETE FROM quiz_words');

						if (isDelete) {
							const [id] = params;
							const index = quizWords.findIndex((word) => word.id === Number(id));

							if (index === -1) {
								return null;
							}

							const [deleted] = quizWords.splice(index, 1);
							return deleted;
						}

						const [subjectId, abbreviation, fullName, description, id] = params;
						const normalizedAbbreviation = String(abbreviation);
						const current = isUpdate
							? quizWords.find((word) => word.id === Number(id))
							: quizWords.find((word) => word.abbreviation === normalizedAbbreviation);

						if (current) {
							current.subject_id = subjectId === null ? null : Number(subjectId);
							current.full_name = String(fullName);
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return current;
						}

						if (isUpdate) {
							return null;
						}

						const quizWord: StoredQuizWord = {
							id: quizWords.length + 1,
							subject_id: subjectId === null ? null : Number(subjectId),
							abbreviation: normalizedAbbreviation,
							full_name: String(fullName),
							description: description === null ? null : String(description),
							created_at: '2026-04-27 16:00:00',
							updated_at: '2026-04-27 16:00:00',
						};

						quizWords.push(quizWord);

						return quizWord;
					}

					const [menu, cardId, cardName, description, image] = params;
					const winner: StoredWinner = {
						id: winners.length + 1,
						menu: String(menu),
						card_id: Number(cardId),
						card_name: String(cardName),
						description: description === null ? null : String(description),
						image: image === null ? null : String(image),
						created_at: '2026-04-27 16:00:00',
					};

					winners.push(winner);

					return winner;
				},
			};
		},
	};

	return { pick_your_favorite: db } as unknown as Env;
}

async function fetchWithEnv(request: Request<unknown, IncomingRequestCfProperties>, env = createMockEnv()) {
	return worker.fetch(request, env);
}

describe('winners API', () => {
	it('creates a winner', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/winners', {
				method: 'POST',
				body: JSON.stringify({
					menu: '1990-female-singer',
					cardId: 10,
					cardName: 'Example Singer',
					description: 'final winner',
					image: 'https://example.com/singer.jpg',
				}),
			}),
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			winner: {
				menu: '1990-female-singer',
				card_id: 10,
				card_name: 'Example Singer',
			},
		});
	});

	it('lists winners for a menu', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/winners?menu=1990-female-singer'),
			createMockEnv([
				{
					id: 1,
					menu: '1990-female-singer',
					card_id: 10,
					card_name: 'Example Singer',
					description: null,
					image: null,
					created_at: '2026-04-27 15:00:00',
				},
			]),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			winners: [{ card_id: 10, card_name: 'Example Singer' }],
		});
	});

	it('summarizes winners for a menu', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/winners/summary?menu=1990-female-singer'),
			createMockEnv([
				{
					id: 1,
					menu: '1990-female-singer',
					card_id: 10,
					card_name: 'Example Singer',
					description: null,
					image: null,
					created_at: '2026-04-27 15:00:00',
				},
				{
					id: 2,
					menu: '1990-female-singer',
					card_id: 10,
					card_name: 'Example Singer',
					description: null,
					image: null,
					created_at: '2026-04-27 16:00:00',
				},
			]),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			summary: [{ card_id: 10, wins: 2 }],
		});
	});

	it('requires menu when listing winners', async () => {
		const response = await fetchWithEnv(new IncomingRequest('http://example.com/api/winners'));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'menu query parameter is required',
		});
	});
});

describe('quiz words API', () => {
	it('creates a quiz word', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words', {
				method: 'POST',
				body: JSON.stringify({
					subjectId: 1,
					abbreviation: 'api',
					fullName: 'Application Programming Interface',
					description: 'Interface for software communication',
				}),
			}),
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			word: {
				subject_id: 1,
				abbreviation: 'API',
				full_name: 'Application Programming Interface',
				description: 'Interface for software communication',
			},
		});
	});

	it('lists quiz words', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words'),
			createMockEnv([], [
				{
					id: 1,
					subject_id: null,
					abbreviation: 'API',
					full_name: 'Application Programming Interface',
					description: 'Interface for software communication',
					created_at: '2026-04-27 16:00:00',
					updated_at: '2026-04-27 16:00:00',
				},
			]),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			words: [{ abbreviation: 'API', full_name: 'Application Programming Interface' }],
		});
	});

	it('lists quiz words for a subject', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words?subjectId=2'),
			createMockEnv([], [
				{
					id: 1,
					subject_id: 1,
					abbreviation: 'API',
					full_name: 'Application Programming Interface',
					description: null,
					created_at: '2026-04-27 16:00:00',
					updated_at: '2026-04-27 16:00:00',
				},
				{
					id: 2,
					subject_id: 2,
					abbreviation: 'SQL',
					full_name: 'Structured Query Language',
					description: null,
					created_at: '2026-04-27 16:10:00',
					updated_at: '2026-04-27 16:10:00',
				},
			]),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			words: [{ abbreviation: 'SQL' }],
		});
	});

	it('requires fullName when creating a quiz word', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words', {
				method: 'POST',
				body: JSON.stringify({
					abbreviation: 'API',
				}),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'fullName is required',
		});
	});

	it('deletes a quiz word', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words?id=1', {
				method: 'DELETE',
			}),
			createMockEnv(
				[],
				[
					{
						id: 1,
						subject_id: 2,
						abbreviation: 'SQL',
						full_name: 'Structured Query Language',
						description: 'Database language',
						created_at: '2026-04-27 16:00:00',
						updated_at: '2026-04-27 16:00:00',
					},
				],
				[],
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			word: { abbreviation: 'SQL' },
		});
	});
});

describe('subjects API', () => {
	it('creates a subject', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/subjects', {
				method: 'POST',
				body: JSON.stringify({
					title: 'Computer Science',
					description: 'CS abbreviations',
				}),
			}),
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			subject: {
				title: 'Computer Science',
				description: 'CS abbreviations',
			},
		});
	});

	it('lists subjects', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/subjects'),
			createMockEnv([], [], [
				{
					id: 1,
					title: 'Computer Science',
					description: 'CS abbreviations',
					created_at: '2026-04-27 16:00:00',
					updated_at: '2026-04-27 16:00:00',
				},
			]),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			subjects: [{ title: 'Computer Science' }],
		});
	});

	it('deletes a subject', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/subjects?id=1', {
				method: 'DELETE',
			}),
			createMockEnv(
				[],
				[],
				[
					{
						id: 1,
						title: 'Computer Science',
						description: 'CS abbreviations',
						created_at: '2026-04-27 16:00:00',
						updated_at: '2026-04-27 16:00:00',
					},
				],
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			subject: { title: 'Computer Science' },
		});
	});
});
