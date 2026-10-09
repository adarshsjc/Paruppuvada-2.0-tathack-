from app.tools.web_search import _SearchResultsParser, _result_url, build_search_query


def test_search_results_parser_extracts_titles_and_snippets():
    parser = _SearchResultsParser()
    parser.feed(
        '<li class="b_algo"><h2><a href="https://example.com/page">Example <b>Title</b></a></h2>'
        '<p>A useful <b>summary</b>.</p></li>'
    )

    assert parser.results == [{
        "title": "Example Title",
        "url": "https://example.com/page",
        "snippet": "A useful summary.",
    }]


def test_result_url_unwraps_search_redirect_and_rejects_non_http():
    assert _result_url("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F") == "https://example.com/"
    assert _result_url(
        "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS8"
    ) == "https://example.com/"
    assert _result_url("javascript:alert(1)") == ""


def test_search_query_drops_conversation_filler():
    query = build_search_query(
        "Explain how to configure CORS middleware in FastAPI? Include a trustworthy "
        "documentation source. Search marker 20261009-190620"
    )

    assert query == "CORS middleware FastAPI"
