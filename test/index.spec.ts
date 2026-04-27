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

function createMockEnv(seed: StoredWinner[] = []) {
	const winners = [...seed];

	const db = {
		prepare(sql: string) {
			let params: unknown[] = [];

			return {
				bind(...values: unknown[]) {
					params = values;
					return this;
				},
				async run() {
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
