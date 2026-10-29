#pragma once
#include <ArduinoJson.h>
#include <algorithm>
#include "weather_store.h"

namespace web_history {
constexpr unsigned kPageSize = 120;
constexpr size_t kDocumentBytes = JSON_OBJECT_SIZE(4) + JSON_ARRAY_SIZE(kPageSize) +
  kPageSize * JSON_ARRAY_SIZE(7) + 256;
inline bool encode(JsonDocument& doc,const weather::Store& store,uint64_t end,unsigned offset,unsigned count) {
  if(end<weather::kHistoryBuckets-1||offset>=weather::kHistoryBuckets||!count||count>kPageSize)return false;
  const unsigned stop=std::min(unsigned(weather::kHistoryBuckets),offset+count);
  doc.clear();doc["end"]=end;doc["total"]=weather::kHistoryBuckets;doc["next_offset"]=stop;
  auto rows=doc.createNestedArray("rows");
  for(unsigned i=offset;i<stop;++i){
    const uint64_t minute=end-weather::kHistoryBuckets+1+i;
    const auto* b=store.bucket(minute);auto row=rows.createNestedArray();row.add(minute);
    if(b&&b->temperature_count)row.add(b->temperature_sum/b->temperature_count);else row.add(nullptr);
    if(b&&b->wind_count)row.add(b->wind_max);else row.add(nullptr);
    if(b&&b->lux_count)row.add(float(b->lux_sum)/b->lux_count);else row.add(nullptr);
    if(b&&b->humidity_count)row.add(float(b->humidity_sum)/b->humidity_count);else row.add(nullptr);
    if(minute%60==0){const auto rain=store.rain_timeline.window(minute*60000,3600000);if(rain.valid&&rain.complete)row.add(rain.tips/100.0f);else row.add(nullptr);}else row.add(nullptr);
    if(minute%5==0){const auto rain=store.rain_timeline.window(minute*60000,300000);if(rain.valid&&rain.complete)row.add(rain.tips/100.0f);else row.add(nullptr);}else row.add(nullptr);
  }
  return !doc.overflowed();
}
} // namespace web_history
