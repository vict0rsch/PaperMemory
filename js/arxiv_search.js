/* Copyright (c) 2016 Frase
 *
 * Distributed under MIT license (see LICENSE).
 *
 *
 * Search arXiv via its HTTP API
 *
 * can search the following 1 or more fields:
 *   - author
 *   - title
 *   - abstract
 *   - journal reference
 *   - All fields
 *   journal's referenced, as well as all fields.
 */



/**
 * Searches arXiv for papers/documents that match the supplied parameters
 * @param {string} all
 * @param {string} author
 * @param {string} title
 * @param {string} abstrct
 * @param {string} journal_ref
 * @returns {Promise}
 */
function arxiv_search({ all, author, title, abstrct, journal_ref }) {
	var baseUrl = "http://export.arxiv.org/api/query?search_query=";
	var first = true;

	if (author) {
		if (!first) {
			baseUrl += '+AND+';
		}
		baseUrl += "au:" + author;
		first = false;
	}

	if (title) {
		if (!first) {
			baseUrl += '+AND+';
		}
		baseUrl += "ti:" + title;
		first = false;
	}

	if (abstrct) {
		if (!first) {
			baseUrl += '+AND+';
		}
		baseUrl += "abs:" + abstrct;
		first = false;
	}

	if (all) {
		if (!first) {
			baseUrl += '+AND+';
		}
		baseUrl += "all:" + all;
	}

	var deferred = $.Deferred();
	$.ajax({
		url: baseUrl,
		type: "get",
		dataType: "xml",
		success: function (xml) {
			var entry = [];
			$(xml).find('entry').each(function (index) {
				var id = $(this).find('id').text();
				var pub_date = $(this).find('published').text();
				var title = $(this).find('title').text();
				var summary = $(this).find('summary').text();
				var authors = [];
				$(this).find('author').each(function (index) {
					authors.push($(this).text());
				});

				entry.push({
					'title': title,
					'link': id,
					'summary': summary,
					'date': pub_date,
					'authors': authors
				});
			});

			deferred.resolve(entry);
		},
		error: function (status) {
			console.log("request error " + status + " for url: " + baseUrl);
		}
	});
	return deferred.promise();
}
