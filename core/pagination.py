from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    # Bumped from 200 → 1000. Multiple admin pages (Clients list, Trash,
    # Statistics, education modules) legitimately fetch everything for
    # client-side search/filter. The old cap silently clipped ?page_size=500
    # requests at 200 — user reported "272 клиентов всего, в корзине
    # показывает 200". 1000 is generous for the foreseeable future
    # while still protecting the server from accidental million-row pulls.
    max_page_size = 1000
