import test from 'node:test';
import assert from 'node:assert/strict';
import {isBailianEndpoint} from '../src/bailian-endpoint.js';
test('allows legacy mainland and workspace-specific official compatible APIs',()=>{
  assert.equal(isBailianEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1'),true);
  assert.equal(isBailianEndpoint('https://ws-example123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/'),true);
});
test('rejects credential exfiltration and unsupported endpoint variants',()=>{
  for(const url of ['https://evil.example/compatible-mode/v1','https://dashscope.aliyuncs.com.evil.example/compatible-mode/v1','http://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1','https://user:pass@dashscope.aliyuncs.com/compatible-mode/v1','https://ws-example.cn-beijing.maas.aliyuncs.com:8443/compatible-mode/v1','https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1?redirect=1','https://dashscope.aliyuncs.com/other','https://ws-example.us-west-1.maas.aliyuncs.com/compatible-mode/v1','invalid']) assert.equal(isBailianEndpoint(url),false,url);
});
