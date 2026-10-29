#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
namespace weather {
constexpr size_t kRainIntervals=4096;
constexpr uint64_t kRainDayMs=86400000;
struct RainInterval {
  uint64_t end_ms=0;
  uint32_t duration_ms=0;
  uint16_t tips=0;
  uint8_t flags=0,reserved=0;
};
class RollingRain {
 public:
  struct State { uint16_t head=0,count=0; };
  struct Total { uint32_t tips=0;bool valid=false,complete=false; };
  explicit RollingRain(RainInterval* data=nullptr):data_(data){}
  void record(uint64_t end,uint64_t duration,uint32_t tips,bool continuous,bool uncertain){
    if(!data_)return;
    if(state_.count==kRainIntervals){state_.head=(state_.head+1)%kRainIntervals;--state_.count;}
    auto& next=data_[(state_.head+state_.count)%kRainIntervals];next=RainInterval{};
    next.end_ms=end;next.duration_ms=uint32_t(std::min(duration,uint64_t(UINT32_MAX)));
    next.tips=uint16_t(std::min(tips,uint32_t(UINT16_MAX)));
    next.flags=(continuous?1:0)|((uncertain||duration>UINT32_MAX||tips>UINT16_MAX)?2:0);++state_.count;
  }
  Total window(uint64_t now,uint64_t span)const{
    Total out;if(!data_||!state_.count||!span)return out;
    const RainInterval* latest=nullptr;
    for(size_t n=state_.count;n>0;--n){const auto& r=data_[(state_.head+n-1)%kRainIntervals];if(r.end_ms<=now){latest=&r;break;}}
    if(!latest || now-latest->end_ms>=span)return out;
    out.valid=true;out.complete=now>=span;const uint64_t begin=now>=span?now-span:0;
    uint64_t covered=begin;
    for(size_t n=0;n<state_.count;++n){
      const auto& r=data_[(state_.head+n)%kRainIntervals];if(r.end_ms<=begin||r.end_ms>now)continue;
      const uint64_t start=r.end_ms>=r.duration_ms?r.end_ms-r.duration_ms:0;
      if(start>covered || !(r.flags&1) || (r.flags&2))out.complete=false;
      covered=std::max(covered,r.end_ms);
      if(start<begin && r.tips){
        // Tips in an interval straddling the left boundary cannot be placed
        // exactly. Exclude them and mark the displayed window partial.
        out.complete=false;
      }else out.tips+=r.tips;
    }
    if(covered>now || now-covered>=120000)out.complete=false;
    return out;
  }
  State state()const{return state_;}
  bool restore(State s){if(s.head>=kRainIntervals||s.count>kRainIntervals)return false;state_=s;return true;}
  const RainInterval* data()const{return data_;}
  RainInterval* data(){return data_;}
 private:
  RainInterval* data_;
  State state_;
};
}
