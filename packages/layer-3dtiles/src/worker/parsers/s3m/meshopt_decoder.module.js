// This file is part of meshoptimizer library and is distributed under the terms of MIT License.
// Copyright (C) 2016-2021, by Arseny Kapoulkine (arseny.kapoulkine@gmail.com)
var MeshoptDecoder = (function() {
	"use strict";

	// Built with clang version 11.0.0 (https://github.com/llvm/llvm-project 176249bd6732a8044d457092ed932768724a6f06)
	// Built from meshoptimizer 0.17
	var wasm_base = "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";
	var wasm_simd = "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";

	// Uses bulk-memory and simd extensions
	var detector = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]);

	// Used to unpack wasm
	var wasmpack = new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);

	if (typeof WebAssembly !== 'object') {
		// This module requires WebAssembly to function
		return {
			supported: false,
		};
	}

	var wasm = wasm_base;

	if (WebAssembly.validate(detector)) {
		wasm = wasm_simd;
	}

	var instance;

	var promise =
		WebAssembly.instantiate(unpack(wasm), {})
		.then(function(result) {
			instance = result.instance;
			instance.exports['__wasm_call_ctors']();
		});

	function unpack(data) {
		var result = new Uint8Array(data.length);
		for (var i = 0; i < data.length; ++i) {
			var ch = data.charCodeAt(i);
			result[i] = ch > 96 ? ch - 71 : ch > 64 ? ch - 65 : ch > 47 ? ch + 4 : ch > 46 ? 63 : 62;
		}
		var write = 0;
		for (let i = 0; i < data.length; ++i) {
			result[write++] = (result[i] < 60) ? wasmpack[result[i]] : (result[i] - 60) * 64 + result[++i];
		}
		return result.buffer.slice(0, write);
	}

	function decode(fun, target, count, size, source, filter) {
		var sbrk = instance.exports.sbrk;
		var count4 = (count + 3) & ~3; // pad for SIMD filter
		var tp = sbrk(count4 * size);
		var sp = sbrk(source.length);
		var heap = new Uint8Array(instance.exports.memory.buffer);
		heap.set(source, sp);
		var res = fun(tp, count, size, sp, source.length);
		if (res == 0 && filter) {
			filter(tp, count4, size);
		}
		target.set(heap.subarray(tp, tp + count * size));
		sbrk(tp - sbrk(0));
		if (res != 0) {
			throw new Error("Malformed buffer data: " + res);
		}
	}

	var filters = {
		// legacy index-based enums for glTF
		0: "",
		1: "meshopt_decodeFilterOct",
		2: "meshopt_decodeFilterQuat",
		3: "meshopt_decodeFilterExp",
		// string-based enums for glTF
		NONE: "",
		OCTAHEDRAL: "meshopt_decodeFilterOct",
		QUATERNION: "meshopt_decodeFilterQuat",
		EXPONENTIAL: "meshopt_decodeFilterExp",
	};

	var decoders = {
		// legacy index-based enums for glTF
		0: "meshopt_decodeVertexBuffer",
		1: "meshopt_decodeIndexBuffer",
		2: "meshopt_decodeIndexSequence",
		// string-based enums for glTF
		ATTRIBUTES: "meshopt_decodeVertexBuffer",
		TRIANGLES: "meshopt_decodeIndexBuffer",
		INDICES: "meshopt_decodeIndexSequence",
	};

	return {
		ready: promise,
		supported: true,
		decodeVertexBuffer: function(target, count, size, source, filter) {
			decode(instance.exports.meshopt_decodeVertexBuffer, target, count, size, source, instance.exports[filters[filter]]);
		},
		decodeIndexBuffer: function(target, count, size, source) {
			decode(instance.exports.meshopt_decodeIndexBuffer, target, count, size, source);
		},
		decodeIndexSequence: function(target, count, size, source) {
			decode(instance.exports.meshopt_decodeIndexSequence, target, count, size, source);
		},
		decodeGltfBuffer: function(target, count, size, source, mode, filter) {
			decode(instance.exports[decoders[mode]], target, count, size, source, instance.exports[filters[filter]]);
		}
	};
})();

export default MeshoptDecoder;
