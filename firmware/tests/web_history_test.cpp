#include "web_history.h"
#include <cassert>
#include <iostream>
#include <vector>

int main(){
  constexpr uint64_t end=29876500;
  std::vector<weather::Bucket> buckets(weather::kHistoryBuckets);
  std::vector<weather::RainInterval> rain(weather::kRainIntervals);
  weather::Store store(buckets.data(),679,'A',rain.data());
  DynamicJsonDocument doc(web_history::kDocumentBytes);
  assert(web_history::encode(doc,store,end,0,120));
  assert(doc["rows"].size()==120&&doc["next_offset"]==120);
  assert(doc["rows"][0][0].as<uint64_t>()==end-1439);
  assert(doc["rows"][0][1].isNull()); // Missing is distinct from a measured zero.
  for(unsigned i=0;i<120;++i){
    weather::Sample s;s.time_ms=(end-1439+i)*60000+1;s.type=37;
    s.temperature.set(0,s.time_ms);s.wind.set(0,s.time_ms);
    s.lux.set(0,s.time_ms);s.humidity.set(0,s.time_ms);
    assert(store.ingest(s)==weather::Result::Accepted);
  }
  const unsigned rain_index=unsigned((60-(end-1439)%60)%60);
  const uint64_t rain_end=(end-1439+rain_index)*60000;
  store.rain_timeline.record(rain_end,3600000,2,true,false);
  store.rain_timeline.record(rain_end+3600000,3600000,0,true,false);
  const auto accepted=store.accepted;
  assert(web_history::encode(doc,store,end,0,120));
  assert(!doc.overflowed());
  for(auto row:doc["rows"].as<JsonArray>())for(unsigned field=1;field<5;++field)assert(!row[field].isNull()&&row[field].as<float>()==0);
  assert(doc["rows"][rain_index][5].as<float>()>0.019f);
  assert(!doc["rows"][rain_index+60][5].isNull() && doc["rows"][rain_index+60][5].as<float>()==0);
  assert(doc["rows"][0][5].isNull());
  assert(store.accepted==accepted); // A browser read cannot freshen weather.
  assert(web_history::encode(doc,store,end,1439,120));
  assert(doc["next_offset"]==1440&&doc["rows"].size()==1);
  assert(doc["rows"][0][0].as<uint64_t>()==end);
  assert(doc["rows"][0][1].isNull());
  assert(!web_history::encode(doc,store,end,1440,1));
  assert(!web_history::encode(doc,store,end,0,0));
  assert(!web_history::encode(doc,store,end,0,121));
  assert(!web_history::encode(doc,store,100,0,1));
  DynamicJsonDocument small(256);assert(!web_history::encode(small,store,end,0,120));
  std::cout<<"Web history checks passed: bounded pages, UTC indexing, missing/zero, full-capacity serialization, final page, invalid ranges and read-only state.\n";
}
