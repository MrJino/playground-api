import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

type StoredWinner = {
	id: number;
	topic_id: number;
	card_id: number;
	created_at: string;
};

type StoredFavoriteTopic = {
	id: number;
	value: string;
};

type StoredFavoriteCard = {
	id: number;
	topic_id: number;
	name: string;
	description: string | null;
	image: string | null;
};

type StoredQuizWord = {
	id: number;
	topic_id: number | null;
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

const defaultFavoriteTopics: StoredFavoriteTopic[] = [{ id: 1, value: '1990-female-singer' }];
const defaultFavoriteCards: StoredFavoriteCard[] = [{ id: 10, topic_id: 1, name: 'Example Singer', description: null, image: null }];

function createMockEnv(
	seed: StoredWinner[] = [],
	quizWordSeed: StoredQuizWord[] = [],
	subjectSeed: StoredSubject[] = [],
	favoriteTopicSeed: StoredFavoriteTopic[] = defaultFavoriteTopics,
	favoriteCardSeed: StoredFavoriteCard[] = defaultFavoriteCards,
) {
	const winners = [...seed];
	const quizWords = [...quizWordSeed];
	const quiz_topics = [...subjectSeed];
	const favoriteTopics = [...favoriteTopicSeed];
	const favoriteCards = [...favoriteCardSeed];

	function getFavoriteTopicByValue(value: string) {
		return favoriteTopics.find((topic) => topic.value === value) || null;
	}

	function getFavoriteCardById(id: number) {
		return favoriteCards.find((card) => card.id === id) || null;
	}

	function toWinnerResponse(winner: StoredWinner) {
		const topic = favoriteTopics.find((item) => item.id === winner.topic_id);
		const card = favoriteCards.find((item) => item.id === winner.card_id);

		return {
			...winner,
			menu: topic?.value || '',
			card_name: card?.name || '',
			description: card?.description ?? null,
			image: card?.image ?? null,
		};
	}

	const db = {
		prepare(sql: string) {
			let params: unknown[] = [];

			return {
				bind(...values: unknown[]) {
					params = values;
					return this;
				},
				async run() {
					if (sql.includes('FROM quiz_topics')) {
						return {
							results: [...quiz_topics].sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id),
						};
					}

					if (sql.includes('FROM quiz_words')) {
						const filteredWords = sql.includes('WHERE topic_id = ?')
							? quizWords.filter((word) => word.topic_id === Number(params[0]))
							: quizWords;

						return {
							results: [...filteredWords]
								.map((word) => ({ ...word }))
								.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
						};
					}

					if (sql.includes('COUNT(*) AS wins')) {
						const menu = String(params[0]);
						const topic = getFavoriteTopicByValue(menu);
						const summary = new Map<number, ReturnType<typeof toWinnerResponse> & { wins: number }>();

						for (const winner of winners.filter((item) => item.topic_id === topic?.id)) {
							const current = summary.get(winner.card_id);
							const response = toWinnerResponse(winner);

							if (current) {
								current.wins += 1;
								current.created_at = current.created_at > winner.created_at ? current.created_at : winner.created_at;
							} else {
								summary.set(winner.card_id, { ...response, wins: 1 });
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

					if (sql.includes('FROM favorite_winners w')) {
						const menu = String(params[0]);
						const topic = getFavoriteTopicByValue(menu);

						return {
							results: winners
								.filter((item) => item.topic_id === topic?.id)
								.map(toWinnerResponse)
								.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
						};
					}

					const menu = String(params[0]);
					return {
						results: winners
							.filter((item) => toWinnerResponse(item).menu === menu)
							.map(toWinnerResponse)
							.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
					};
				},
				async first() {
					if (sql.includes('quiz_topics')) {
						const isUpdate = sql.trim().startsWith('UPDATE quiz_topics');
						const isDelete = sql.trim().startsWith('DELETE FROM quiz_topics');
						if (isDelete) {
							const [id] = params;
							const index = quiz_topics.findIndex((subject) => subject.id === Number(id));

							if (index === -1) {
								return null;
							}

							const [deleted] = quiz_topics.splice(index, 1);
							for (let index = quizWords.length - 1; index >= 0; index -= 1) {
								if (quizWords[index].topic_id === deleted.id) {
									quizWords.splice(index, 1);
								}
							}

							return deleted;
						}

						const [title, description, id] = params;

						if (isUpdate) {
							const current = quiz_topics.find((subject) => subject.id === Number(id));

							if (!current) {
								return null;
							}

							current.title = String(title);
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return current;
						}

						const current = quiz_topics.find((subject) => subject.title === String(title));

						if (current) {
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return current;
						}

						const subject: StoredSubject = {
							id: quiz_topics.length + 1,
							title: String(title),
							description: description === null ? null : String(description),
							created_at: '2026-04-27 16:00:00',
							updated_at: '2026-04-27 16:00:00',
						};

						quiz_topics.push(subject);

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
							return { ...deleted };
						}

						const [topicId, abbreviation, fullName, description, id] = params;
						const normalizedAbbreviation = String(abbreviation);
						const current = isUpdate
							? quizWords.find((word) => word.id === Number(id))
							: quizWords.find((word) => word.abbreviation === normalizedAbbreviation);

						if (current) {
							current.topic_id = topicId === null ? null : Number(topicId);
							current.full_name = String(fullName);
							current.description = description === null ? null : String(description);
							current.updated_at = '2026-04-27 16:30:00';
							return { ...current };
						}

						if (isUpdate) {
							return null;
						}

						const quizWord: StoredQuizWord = {
							id: quizWords.length + 1,
							topic_id: topicId === null ? null : Number(topicId),
							abbreviation: normalizedAbbreviation,
							full_name: String(fullName),
							description: description === null ? null : String(description),
							created_at: '2026-04-27 16:00:00',
							updated_at: '2026-04-27 16:00:00',
						};

						quizWords.push(quizWord);

						return { ...quizWord };
					}

					if (sql.includes('FROM favorite_topics t') && sql.includes('INNER JOIN favorite_cards c')) {
						const [menu, cardId] = params;
						const topic = getFavoriteTopicByValue(String(menu));
						const card = getFavoriteCardById(Number(cardId));

						if (!topic || !card || card.topic_id !== topic.id) {
							return null;
						}

						return {
							topic_id: topic.id,
							menu: topic.value,
							card_id: card.id,
							card_name: card.name,
							description: card.description,
							image: card.image,
						};
					}

					const [topicId, cardId] = params;
					const winner: StoredWinner = {
						id: winners.length + 1,
						topic_id: Number(topicId),
						card_id: Number(cardId),
						created_at: '2026-04-27 16:00:00',
					};

					winners.push(winner);

					return winner;
				},
			};
		},
	};

	return { playground: db } as unknown as Env;
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
					topic_id: 1,
					card_id: 10,
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
					topic_id: 1,
					card_id: 10,
					created_at: '2026-04-27 15:00:00',
				},
				{
					id: 2,
					topic_id: 1,
					card_id: 10,
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
					topicId: 1,
					abbreviation: 'api',
					fullName: 'Application Programming Interface',
					description: 'Interface for software communication',
				}),
			}),
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			word: {
				topic_id: 1,
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
					topic_id: null,
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

	it('lists quiz words for a topic', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/quiz-words?topicId=2'),
			createMockEnv([], [
				{
					id: 1,
					topic_id: 1,
					abbreviation: 'API',
					full_name: 'Application Programming Interface',
					description: null,
					created_at: '2026-04-27 16:00:00',
					updated_at: '2026-04-27 16:00:00',
				},
				{
					id: 2,
					topic_id: 2,
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
						topic_id: 2,
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

describe('topics API', () => {
	it('creates a topic', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/topics', {
				method: 'POST',
				body: JSON.stringify({
					title: 'Computer Science',
					description: 'CS abbreviations',
				}),
			}),
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			topic: {
				title: 'Computer Science',
				description: 'CS abbreviations',
			},
		});
	});

	it('lists topics', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/topics'),
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
			topics: [{ title: 'Computer Science' }],
		});
	});

	it('deletes a topic', async () => {
		const response = await fetchWithEnv(
			new IncomingRequest('http://example.com/api/topics?id=1', {
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
			topic: { title: 'Computer Science' },
		});
	});
});
