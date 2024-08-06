//IGN game metadata api
const axios = require("axios");
const express = require("express");
const he = require("he");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

function toQueryStringParameter(obj) {
	return encodeURIComponent(JSON.stringify(obj));
}

async function callGraphQL(operationName, variables, hash) {
	const extensions = { persistedQuery: { version: 1, sha256Hash: hash } };
	const variablesParameter = toQueryStringParameter(variables);
	const extensionsParameter = toQueryStringParameter(extensions);
	const url = `https://mollusk.apis.ign.com/graphql?operationName=${operationName}&variables=${variablesParameter}&extensions=${extensionsParameter}`;

	try {
		const response = await axios.get(url, {
			headers: {
				"Content-Type": "application/json",
				"x-apollo-operation-name": operationName,
				"apollographql-client-name": "kraken",
				"apollographql-client-version": "v0.23.3",
			},
			referrer: "https://www.ign.com/reviews/games",
		});

		if (response.data.errors) {
			console.error("GraphQL Errors:", response.data.errors);
			return null;
		}

		return response.data;
	} catch (error) {
		console.error("Request Error:", error);
		return null;
	}
}

async function searchGame(query) {
	if (!query.trim()) return [];

	const variables = { term: query, count: 20, objectType: "Game" };

	try {
		const data = await callGraphQL("SearchObjectsByName", variables, "664276ed5455a5a05182a25250b11cbe0601a6ecf2e91247d90d34617335d5da");

		if (data && data.data.searchObjectsByName.objects) {
			return data.data.searchObjectsByName.objects;
		} else {
			return {};
		}
	} catch (error) {
		console.error(`Error fetching search data: ${error.message}`);
		return { error: "Failed to fetch search data" };
	}
}

async function getGame(slug, region) {
	const variables = { slug: slug, objectType: "Game", region: region, state: "Published" };

	try {
		const data = await callGraphQL("ObjectSelectByTypeAndSlug", variables, "c5ceac7141d5e6900705417171625a0d7383ee89056a5b5edaf5f61cb466fb5f");

		if (data && data.data.objectSelectByTypeAndSlug) {
			return data.data.objectSelectByTypeAndSlug;
		} else {
			return {};
		}
	} catch (error) {
		console.error(`Error fetching game data: ${error.message}`);
		return { error: "Failed to fetch game data" };
	}
}

app.get("/", (req, res) => {
	res.send("<div style='font-family: sans-serif; font-weight: 500; display: flex; flex-direction: column; gap: 8px; padding: 8px;'><span>Search - GET /search/{query}</span><span>Details - GET /details/{slug} (get slug from search endpoint)</span></div>");
});

app.get("/search/:query", async (req, res) => {
	try {
		const { query } = req.params;

		const searchResults = await searchGame(query);

		if (searchResults.error) {
			return res.status(500).json({ error: searchResults.error });
		}

		if (!Array.isArray(searchResults) || searchResults.length === 0) {
			return res.status(404).json({ error: "No results found" });
		}

		const formattedResults = await Promise.all(
			searchResults.map(async (game) => {
				const { primaryImage, metadata, genres, producers, publishers } = game;

				if (!primaryImage) {
					return null;
				}

				const genreNames = (genres || []).map((genre) => genre.name);
				const producerNames = (producers || []).map((producer) => producer.name);
				const publisherNames = (publishers || []).map((publisher) => publisher.name);

				return {
					image: primaryImage.url,
					slug: game.slug,
					name: metadata.names.name,
					release_date: game.objectRegions[0].releases[0].date,
					genres: genreNames,
					producers: producerNames,
					publishers: publisherNames,
				};
			})
		);

		const validResults = formattedResults.filter((result) => result !== null);

		res.json(validResults);
	} catch (error) {
		console.error(`Error in route handler: ${error.message}`);
		res.status(500).json({ error: "Failed to fetch search results" });
	}
});

app.get("/details/:slug", async (req, res) => {
	try {
		const { slug } = req.params;

		const gameDetails = await getGame(slug, "ca");

		if (gameDetails.error) {
			return res.status(500).json({ error: gameDetails.error });
		}

		const { primaryImage, metadata, genres, producers, publishers } = gameDetails;

		if (!primaryImage) {
			return res.status(500).json({ error: "Incomplete game details" });
		}

		const genreNames = (genres || []).map((genre) => genre.name);
		const producerNames = (producers || []).map((producer) => producer.name);
		const publisherNames = (publishers || []).map((publisher) => publisher.name);

		let decodedShortDescription = he.decode(metadata.descriptions.short);
		let decodedLongDescription = he.decode(metadata.descriptions.long);

		res.json({
			image: primaryImage.url,
			name: metadata.names.name,
			release_date: gameDetails.objectRegions[0].releases[0].date,
			short_description: decodedShortDescription,
			long_description: decodedLongDescription,
			genres: genreNames,
			producers: producerNames,
			publishers: publisherNames,
		});
	} catch (error) {
		console.error(`Error in route handler: ${error.message}`);
		res.status(500).json({ error: "Failed to fetch game details" });
	}
});

app.listen(port, () => {
	console.log("server running on port", port);
});
