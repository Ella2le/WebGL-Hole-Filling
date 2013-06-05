"use strict";


var CONFIG = {
	ALLOWED_FILE_EXTENSIONS: ["obj", "ply", "stl"],
	CAMERA: {
		ANGLE: 45,
		POSITION: {
			X: 0,
			Y: 0,
			Z: 20
		},
		ZFAR: 2500,
		ZNEAR: 0.1
	},
	CONTROLS: {
		PAN_SPEED: 0.8,
		ROT_SPEED: 1.5,
		ZOOM_SPEED: 1.5
	},
	COLOR: {
		BOUNDING_BOX: 0x37FEFE,
		HF_BORDER_EDGES: [0xFF0000, 0xFF57DE, 0xFFC620, 0x74FF3A]
	},
	HF_LINEWIDTH: 2,
	MODE: "solid",
	SHADING: "phong"
};
