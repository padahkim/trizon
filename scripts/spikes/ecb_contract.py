"""Offline examples for #54, not an application FX provider. Python 3.10+.

Run from any directory: python3 /path/to/trizon/scripts/spikes/ecb_contract.py
Only stdlib and committed public/synthetic fixtures are used; no HTTP requests.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree
from zoneinfo import ZoneInfo


FRANKFURT = ZoneInfo("Europe/Berlin")
CUBE = "{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}Cube"
CURRENCIES = ("USD", "JPY", "KRW")
# TARGET closing days, not the longer list of ECB staff holidays.
# This spike deliberately fails closed outside the checked calendar horizon.
HOLIDAYS = {
    2026: {"01-01", "04-03", "04-06", "05-01", "12-25", "12-26"},
    2027: {"01-01", "03-26", "03-29", "05-01", "12-25", "12-26"},
}


@dataclass(frozen=True)
class FxSet:
    observation_date: date
    collected_at: datetime
    rates_per_eur: dict[str, float]


def instant(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("An instant needs an explicit UTC offset")
    return result.astimezone(timezone.utc)


def business_day(day: date) -> bool:
    if day.year not in HOLIDAYS:
        raise ValueError("Unverified TARGET calendar year")
    return day.weekday() < 5 and day.strftime("%m-%d") not in HOLIDAYS[day.year]


def publication(day: date) -> datetime:
    # This is the product's expected publication boundary, not an observation time.
    return datetime.combine(day, time(16), FRANKFURT)


def normalize(xml: str, collected_at: datetime) -> FxSet:
    days = ElementTree.fromstring(xml).findall(f".//{CUBE}[@time]")
    if len(days) != 1:
        raise ValueError("A daily response must contain exactly one observation date")
    raw_day = days[0].attrib["time"]
    day = date.fromisoformat(raw_day)
    if raw_day != day.isoformat() or not business_day(day):
        raise ValueError("Invalid observation date")
    if day > collected_at.astimezone(FRANKFURT).date():
        raise ValueError("Future observation date")
    rates = {}
    for row in days[0].findall(CUBE):
        currency = row.get("currency")
        if currency not in CURRENCIES:
            continue
        if currency in rates:
            raise ValueError("Duplicate required currency")
        value = float(row.attrib["rate"])
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Rate must be positive and finite")
        rates[currency] = value
    if set(rates) != set(CURRENCIES):
        raise ValueError("Missing required currency")
    return FxSet(day, collected_at, rates)


def receive(cache: FxSet | None, result: int | str, xml: str, at: datetime):
    if result != 200:
        return cache, str(result)
    try:
        candidate = normalize(xml, at)
    except (ValueError, KeyError, ElementTree.ParseError):
        return cache, "invalid-set"
    if cache is not None and candidate.observation_date < cache.observation_date:
        return cache, "regressed-date"
    return candidate, "ok"


def assess(cache: FxSet | None, now: datetime) -> str:
    if cache is None:
        return "withheld"
    if cache.collected_at > now:
        return "withheld"
    # A cache must already have passed the same whole-set validation as a response.
    try:
        day = cache.observation_date + timedelta(days=1)
        end = now.astimezone(FRANKFURT).date()
        if end.year not in HOLIDAYS:
            return "withheld"
        missed = 0
        while day <= end:
            if business_day(day) and now >= publication(day):
                missed += 1
                if missed == 2:
                    return "withheld"
            day += timedelta(days=1)
        return "grace" if missed else "current"
    except ValueError:
        return "withheld"


def synthetic(day="2026-10-30", rates=("1.25", "200", "1500")) -> str:
    rows = "".join(
        f'<Cube currency="{currency}" rate="{value}"/>'
        for currency, value in zip(CURRENCIES, rates)
    )
    return (
        '<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">'
        f'<Cube><Cube time="{day}">{rows}</Cube></Cube></Envelope>'
    )


def check(actual, expected, name: str):
    if actual != expected:
        raise AssertionError(f"{name}: expected {expected!r}, got {actual!r}")
    print(f"PASS {name}: {expected}")


def main():
    fixtures = Path(__file__).resolve().parents[2] / "docs/research/fixtures/ecb"
    capture = json.loads((fixtures / "daily.capture.json").read_text())
    raw = (fixtures / "daily.xml").read_bytes()
    check(hashlib.sha256(raw).hexdigest(), capture["sha256"], "captured XML integrity")
    observed = normalize(raw.decode("utf-8"), instant(capture["collectedAt"]))
    check(observed.observation_date.isoformat(), "2026-10-29", "actual observation date")
    check(observed.rates_per_eur, {"USD": 1.113, "JPY": 175.92, "KRW": 1488.40},
          "actual same-date required set")
    check(assess(observed, instant(capture["collectedAt"])), "current", "actual publication comparison")

    friday = normalize(synthetic(), instant("2026-10-30T16:05:00Z"))
    partial_cache, _ = receive(None, 200, synthetic(rates=("1.25", "200")),
                               instant("2026-10-30T16:05:00Z"))
    # Expected states are worked examples from the contract, not generated by assess.
    cases = [
        ("weekend", friday, "2026-10-31T16:00:00Z", "current"),
        ("Monday before publication", friday, "2026-11-02T14:59:59Z", "current"),
        ("Monday publication missing", friday, "2026-11-02T15:00:00Z", "grace"),
        ("Monday still missing", friday, "2026-11-02T21:00:00Z", "grace"),
        ("Tuesday before publication", friday, "2026-11-03T14:59:59Z", "grace"),
        ("Tuesday publication missing", friday, "2026-11-03T15:00:00Z", "withheld"),
        ("long disconnected", friday, "2026-11-16T09:00:00Z", "withheld"),
        ("no cache", None, "2026-11-02T14:00:00Z", "withheld"),
        ("partial cached set", partial_cache, "2026-11-02T14:00:00Z", "withheld"),
        ("unverified calendar", friday, "2028-01-03T16:00:00Z", "withheld"),
    ]
    thursday = normalize(synthetic("2026-12-24"), instant("2026-12-24T15:05:00Z"))
    cases += [
        ("Christmas holiday", thursday, "2026-12-25T17:00:00Z", "current"),
        ("Christmas weekend", thursday, "2026-12-27T17:00:00Z", "current"),
        ("Monday after Christmas", thursday, "2026-12-28T15:00:00Z", "grace"),
        ("Tuesday after Christmas", thursday, "2026-12-29T15:00:00Z", "withheld"),
    ]
    easter = normalize(synthetic("2026-04-02"), instant("2026-04-02T14:05:00Z"))
    cases += [
        ("Good Friday", easter, "2026-04-03T15:00:00Z", "current"),
        ("Easter Monday", easter, "2026-04-06T15:00:00Z", "current"),
        ("Tuesday after Easter", easter, "2026-04-07T14:00:00Z", "grace"),
        ("Wednesday after Easter", easter, "2026-04-08T14:00:00Z", "withheld"),
    ]
    for name, cache, now, expected in cases:
        check(assess(cache, instant(now)), expected, name)

    for day, expected in [
        ("2026-03-27", "2026-03-27T15:00:00+00:00"),
        ("2026-03-30", "2026-03-30T14:00:00+00:00"),
        ("2026-10-23", "2026-10-23T14:00:00+00:00"),
        ("2026-10-26", "2026-10-26T15:00:00+00:00"),
    ]:
        check(publication(date.fromisoformat(day)).astimezone(timezone.utc).isoformat(),
              expected, f"DST boundary {day}")

    # ECB staff holidays that are not TARGET closures must still consume a cycle.
    check(business_day(date(2026, 5, 14)), True, "Ascension is a publication day")
    check(business_day(date(2026, 12, 24)), True, "Christmas Eve is a publication day")
    check(business_day(date(2027, 3, 26)), False, "2027 Good Friday")
    check(business_day(date(2027, 3, 29)), False, "2027 Easter Monday")
    new_year = normalize(synthetic("2026-12-31"), instant("2026-12-31T15:05:00Z"))
    check(assess(new_year, instant("2027-01-01T18:00:00Z")), "current", "New Year")
    check(assess(new_year, instant("2027-01-04T15:00:00Z")), "grace", "year boundary first slot")

    # A repeat GET of Friday data on Tuesday is successful transport, still expired.
    repeated, result = receive(friday, 200, synthetic(), instant("2026-11-03T15:01:00Z"))
    check(result, "ok", "same-date GET")
    check(assess(repeated, instant("2026-11-03T15:01:00Z")), "withheld", "reconnect cannot reset grace")
    monday, _ = receive(friday, 200, synthetic("2026-11-02"), instant("2026-11-03T15:02:00Z"))
    check(assess(monday, instant("2026-11-03T15:02:00Z")), "grace", "late Monday response is one slot behind")
    tuesday, _ = receive(friday, 200, synthetic("2026-11-03"), instant("2026-11-03T15:03:00Z"))
    check(assess(tuesday, instant("2026-11-03T15:03:00Z")), "current", "new full set recovers")

    for failure in (429, "timeout", 503):
        cache, result = receive(friday, failure, "", instant("2026-11-02T15:01:00Z"))
        check(result, str(failure), f"transport {failure}")
        check(cache is friday, True, f"{failure} preserves complete set")
        check(assess(cache, instant("2026-11-02T15:01:00Z")), "grace", f"{failure} Monday grace")
        check(assess(cache, instant("2026-11-03T15:00:00Z")), "withheld", f"{failure} Tuesday expiry")

    valid_xml = synthetic()
    invalid_xmls = {
        "missing KRW": synthetic(rates=("1.25", "200")),
        "zero": synthetic(rates=("0", "200", "1500")),
        "negative": synthetic(rates=("-1", "200", "1500")),
        "NaN": synthetic(rates=("NaN", "200", "1500")),
        "infinity": synthetic(rates=("Infinity", "200", "1500")),
        "overflow": synthetic(rates=("1e999", "200", "1500")),
        "not a number": synthetic(rates=("bad", "200", "1500")),
        "missing rate": valid_xml.replace('rate="1.25"', ""),
        "duplicate USD": valid_xml.replace('<Cube currency="JPY"', '<Cube currency="USD"'),
        "mixed dates": valid_xml.replace('<Cube currency="KRW"', '</Cube><Cube time="2026-11-02"><Cube currency="KRW"'),
        "weekend date": synthetic("2026-10-31"),
        "future date": synthetic("2026-11-04"),
        "invalid date": synthetic("2026-02-30"),
        "malformed XML": "<broken>",
    }
    for name, xml in invalid_xmls.items():
        cache, result = receive(friday, 200, xml, instant("2026-11-03T15:01:00Z"))
        check(result, "invalid-set", f"reject {name}")
        check(cache is friday, True, f"{name} cannot replace complete cache")
        empty, _ = receive(None, 200, xml, instant("2026-11-03T15:01:00Z"))
        check(assess(empty, instant("2026-11-03T15:01:00Z")), "withheld", f"{name} without cache")

    cache, result = receive(tuesday, 200, synthetic(), instant("2026-11-03T15:04:00Z"))
    check((cache is tuesday, result), (True, "regressed-date"), "older response cannot overwrite")
    check(100 / friday.rates_per_eur["USD"] * friday.rates_per_eur["JPY"],
          16000.0, "synthetic 100 USD to JPY")
    check(100 / friday.rates_per_eur["USD"] * friday.rates_per_eur["KRW"],
          120000.0, "synthetic 100 USD to KRW")
    print("All offline ECB contract examples passed.")


if __name__ == "__main__":
    main()
