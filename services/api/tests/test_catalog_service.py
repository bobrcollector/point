"""Модульные тесты сервиса каталога (фильтрация, сортировка, гео, парсинг параметров)."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api.v1.catalog import service as catalog_service


def _cat(cat_id: int, name: str):
    return SimpleNamespace(id=cat_id, name=name)


def make_event(**kwargs):
    defaults = {
        "id": 1,
        "title": "Событие",
        "event_datetime": datetime(2026, 6, 15, 18, 0, tzinfo=timezone.utc),
        "location": "Москва",
        "price": 500.0,
        "average_rating": 4.0,
        "cover_image_url": None,
        "latitude": 55.7558,
        "longitude": 37.6173,
        "is_for_children": False,
        "age_rating_min": 12,
        "categories": [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestParsers:
    def test_parse_bounds_valid(self):
        assert catalog_service.parse_bounds("37.5,55.7,37.7,55.8") == (37.5, 55.7, 37.7, 55.8)

    def test_parse_bounds_invalid(self):
        assert catalog_service.parse_bounds(None) is None
        assert catalog_service.parse_bounds("") is None
        assert catalog_service.parse_bounds("1,2,3") is None
        assert catalog_service.parse_bounds("a,b,c,d") is None

    def test_parse_category_ids(self):
        assert catalog_service.parse_category_ids("1, 3,5") == {1, 3, 5}
        assert catalog_service.parse_category_ids("") is None
        assert catalog_service.parse_category_ids("x,2") == {2}

    def test_parse_age_ratings(self):
        assert catalog_service.parse_age_ratings("0,6,12") == {0, 6, 12}
        assert catalog_service.parse_age_ratings("99") is None
        assert catalog_service.parse_age_ratings("") is None

    def test_parse_iso_datetime(self):
        dt = catalog_service.parse_iso_datetime("2026-05-01T10:00:00+00:00")
        assert dt is not None
        assert dt.year == 2026
        assert catalog_service.parse_iso_datetime("not-a-date") is None


class TestHaversine:
    def test_same_point_zero_distance(self):
        d = catalog_service.haversine_m(55.75, 37.62, 55.75, 37.62)
        assert d == pytest.approx(0, abs=1)

    def test_known_distance_order_of_magnitude(self):
        # Москва — ~630 км по прямой до СПб
        d = catalog_service.haversine_m(55.7558, 37.6173, 59.9343, 30.3351)
        assert 600_000 < d < 700_000


class TestFilterAndSort:
    def test_filter_by_category(self):
        ev_match = make_event(id=1, categories=[_cat(1, "Концерты")])
        ev_other = make_event(id=2, categories=[_cat(2, "Спорт")])
        result = catalog_service.filter_and_sort_events(
            [ev_match, ev_other],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids={1},
            bounds=None,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=None,
            age_ratings=None,
            sort_by="date",
        )
        assert [t[0].id for t in result] == [1]

    def test_events_without_coords_not_removed_when_bounds_set(self):
        """События без координат остаются в ленте при bounds (для карты/списка)."""
        with_coords = make_event(id=1, latitude=55.76, longitude=37.62)
        no_coords = make_event(id=2, latitude=None, longitude=None)
        bounds = (37.0, 55.0, 38.0, 56.0)
        result = catalog_service.filter_and_sort_events(
            [with_coords, no_coords],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids=None,
            bounds=bounds,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=None,
            age_ratings=None,
            sort_by="date",
        )
        ids = {t[0].id for t in result}
        assert 2 in ids

    def test_bounds_filters_only_geolocated_events(self):
        inside = make_event(id=1, latitude=55.76, longitude=37.62)
        outside = make_event(id=2, latitude=59.93, longitude=30.33)
        bounds = (37.0, 55.0, 38.0, 56.0)
        result = catalog_service.filter_and_sort_events(
            [inside, outside],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids=None,
            bounds=bounds,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=None,
            age_ratings=None,
            sort_by="date",
        )
        assert [t[0].id for t in result] == [1]

    def test_price_and_age_filters(self):
        ev = make_event(id=1, price=100, age_rating_min=18)
        ev_cheap = make_event(id=2, price=0, age_rating_min=0)
        result = catalog_service.filter_and_sort_events(
            [ev, ev_cheap],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids=None,
            bounds=None,
            date_from=None,
            date_to=None,
            price_min=50,
            price_max=200,
            for_children=None,
            age_ratings={18},
            sort_by="date",
        )
        assert [t[0].id for t in result] == [1]

    def test_radius_filter_with_geo(self):
        near = make_event(id=1, latitude=55.756, longitude=37.618)
        far = make_event(id=2, latitude=55.9, longitude=38.5)
        result = catalog_service.filter_and_sort_events(
            [near, far],
            lat=55.7558,
            lon=37.6173,
            radius_m=5000,
            category_ids=None,
            bounds=None,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=None,
            age_ratings=None,
            sort_by="distance",
        )
        assert len(result) == 1
        assert result[0][0].id == 1
        assert result[0][1] is not None
        assert result[0][1] < 5000

    def test_sort_by_rating(self):
        low = make_event(id=1, average_rating=3.0)
        high = make_event(id=2, average_rating=5.0)
        result = catalog_service.filter_and_sort_events(
            [low, high],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids=None,
            bounds=None,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=None,
            age_ratings=None,
            sort_by="rating",
        )
        assert [t[0].id for t in result] == [2, 1]

    def test_for_children_filter(self):
        child = make_event(id=1, is_for_children=True)
        adult = make_event(id=2, is_for_children=False)
        result = catalog_service.filter_and_sort_events(
            [child, adult],
            lat=None,
            lon=None,
            radius_m=None,
            category_ids=None,
            bounds=None,
            date_from=None,
            date_to=None,
            price_min=None,
            price_max=None,
            for_children=True,
            age_ratings=None,
            sort_by="date",
        )
        assert [t[0].id for t in result] == [1]


class TestGetEventByIdFilter:
    """Список и карточка должны использовать один статус (approved)."""

    def test_approved_status_constant_matches_load_all(self):
        import inspect

        src_load = inspect.getsource(catalog_service.load_all_events)
        src_detail = inspect.getsource(catalog_service.get_event_by_id)
        assert 'status == "approved"' in src_load
        assert 'status == "published"' not in src_detail
        assert 'status == "approved"' in src_detail


class TestEventToItemDict:
    def test_serializes_fields(self):
        ev = make_event(
            id=42,
            title="Концерт",
            categories=[_cat(1, "Концерты")],
            latitude=55.75,
            longitude=37.62,
        )
        item = catalog_service.event_to_item_dict(ev, distance=1200)
        assert item["event_id"] == 42
        assert item["title"] == "Концерт"
        assert item["distance"] == 1200
        assert item["categories"] == [{"id": 1, "name": "Концерты"}]
        assert item["latitude"] == 55.75
