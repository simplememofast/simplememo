import test from 'node:test';
import assert from 'node:assert/strict';
import {cachePolicy, IMMUTABLE} from '../../functions/assets/home-perf/_middleware.js';
const url='https://simplememofast.com/assets/home-perf/poster-1280-0123456789ab.webp';
const res=(headers={},status=200)=>new Response(status===304?null:'bytes',{status,headers:{'content-type':'image/webp',...headers}});
test('hashed public WebP has the same narrow 200 and conditional 304 policy',()=>{
  for(const method of ['GET','HEAD']){
    assert.equal(cachePolicy(new Request(url,{method}),res()),IMMUTABLE);
    assert.equal(cachePolicy(new Request(url,{method,headers:{'if-none-match':'"test"'}}),new Response(null,{status:304})),IMMUTABLE);
  }
});
test('WebP does not bypass type path status privacy auth or range boundaries',()=>{
  for(const headers of [{'content-type':'text/html'},{'cache-control':'private'},{'cache-control':'no-store'},{'set-cookie':'x=1'},{vary:'Cookie'},{vary:'Authorization'}])assert.equal(cachePolicy(new Request(url),res(headers)),null);
  for(const headers of [{authorization:'synthetic'},{range:'bytes=0-3'}])assert.equal(cachePolicy(new Request(url,{headers}),res()),null);
  for(const status of [206,301,304,404,500])assert.equal(cachePolicy(new Request(url),res({},status)),null);
  for(const bad of [url.replace('-0123456789ab',''),url.replace('home-perf/','home-perf/sub/'),url.replace('home-perf/','img/')])assert.equal(cachePolicy(new Request(bad),res()),null);
});
