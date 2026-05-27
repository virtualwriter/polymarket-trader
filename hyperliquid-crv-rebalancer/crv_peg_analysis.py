"""
Analyze yCRV/CRV peg data to find the most stable static peg value.
"""
import statistics

# Data from Apr 1 - May 26
peg_data = {
    "4/1": 0.70,
    "4/2": 0.60,
    "4/3": 0.62,
    "4/6": 0.64,
    "4/24": 0.61,
    "4/27": 0.63,
    "4/28": 0.63,
    "4/29": 0.60,
    "4/30": 0.64,
    "5/1": 0.65,
    "5/4": 0.63,
    "5/5": 0.63,
    "5/6": 0.59,
    "5/12": 0.63,
    "5/13": 0.61,
    "5/15": 0.62,
    "5/19": 0.64,
    "5/21": 0.63,
    "5/26": 0.64,
}

dates = list(peg_data.keys())
values = list(peg_data.values())

mean = statistics.mean(values)
median = statistics.median(values)
stdev = statistics.stdev(values)

print(f"Peg Statistics (Apr 1 - May 26, {len(values)} data points)")
print("=" * 50)
print(f"Mean:     {mean:.4f}")
print(f"Median:   {median:.4f}")
print(f"Std Dev:  {stdev:.4f}")
print(f"Min:      {min(values):.4f} ({dates[values.index(min(values))]})")
print(f"Max:      {max(values):.4f} ({dates[values.index(max(values))]})")
print(f"Range:    {max(values) - min(values):.4f}")
print()

# Most common value (mode)
from collections import Counter
counter = Counter(values)
print("Peg Frequency:")
for peg, count in counter.most_common():
    bar = "#" * count
    print(f"  {peg:.2f}: {count}x {bar}")

print()

# Find if we remove outlier (Apr 1 high at 0.70, May 6 low at 0.59)
filtered = [v for v in values if v >= 0.60 and v <= 0.65]
filtered_mean = statistics.mean(filtered)
filtered_stdev = statistics.stdev(filtered)
print(f"With outliers removed (keep 0.60-0.65):")
print(f"  Mean:    {filtered_mean:.4f}")
print(f"  Std Dev: {filtered_stdev:.4f}")
print()

# Best static peg: the one that minimizes tracking error
# For each possible peg value, calculate the cumulative deviation
print("Static Peg Candidates — Total Deviation:")
print(f"{'Peg':<8} {'Sum |peg - actual|':<25} {'Avg Error':<15}")
print("-" * 48)
best_peg = None
best_error = float('inf')
for test_peg in [p/100 for p in range(55, 76)]:
    total_error = sum(abs(test_peg - v) for v in values)
    avg_error = total_error / len(values)
    if total_error < best_error:
        best_error = total_error
        best_peg = test_peg
    print(f"{test_peg:<8.2f} {total_error:<25.4f} {avg_error:<15.4f}")

print()
print(f"BEST STATIC PEG: {best_peg:.2f} (avg error: {best_error/len(values):.4f})")

# Also check: what's the best peg to use for the recent period (May only)?
print()
print("=" * 50)
print("RECENT PERIOD (May 1 - May 26)")
recent_vals = [peg_data[d] for d in dates if d.startswith("5/")]
recent_dates = [d for d in dates if d.startswith("5/")]
recent_mean = statistics.mean(recent_vals)
print(f"Mean: {recent_mean:.4f}")
print(f"Std Dev: {statistics.stdev(recent_vals):.4f}")

best_recent = None
best_recent_error = float('inf')
for test_peg in [p/100 for p in range(55, 76)]:
    total_error = sum(abs(test_peg - v) for v in recent_vals)
    if total_error < best_recent_error:
        best_recent_error = total_error
        best_recent = test_peg
print(f"Best static peg (May only): {best_recent:.2f}")

# And earlier period
print()
print("=" * 50)
print("EARLIER PERIOD (Apr 1 - Apr 30)")
early_vals = [peg_data[d] for d in dates if d.startswith("4/")]
early_mean = statistics.mean(early_vals)
print(f"Mean: {early_mean:.4f}")
print(f"Std Dev: {statistics.stdev(early_vals):.4f}")

best_early = None
best_early_error = float('inf')
for test_peg in [p/100 for p in range(55, 76)]:
    total_error = sum(abs(test_peg - v) for v in early_vals)
    if total_error < best_early_error:
        best_early_error = total_error
        best_early = test_peg
print(f"Best static peg (Apr only): {best_early:.2f}")
print()
print(f"Difference between periods: {abs(best_recent - best_early):.2f}")
