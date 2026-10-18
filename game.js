// This is entirely too clever, but it works and it was fun to write

let $ = (selector) => document.querySelector(selector);
let $$ = (selector) => document.querySelectorAll(selector);

let field = $("#field");
let svg = $("svg");

for (let i = 0; i < 10; i++) {
	let link = document.createElement("link");
	link.rel = "preload";
	link.as = "image";
	link.href = i + ".png";
	document.head.append(link);
}

function stringToImgs(s) {
	return s.split("").map((c) => {
		let img = new Image();
		img.src = c + ".png";
		return img;
	});
}

const STORAGE_KEY = "jacobwinters-ld60";
const SCENE = location.pathname.split("/").at(-1);
const DEBUG = new URLSearchParams(location.search).has("debug");

const CONST_COLOR = Symbol("CONST_COLOR");

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { lights: {}, complete: {}, completed: {} };
let isAvailable;

let circles = [];
let edges = [];

function phase() {
	if (!state.completed["tree.xhtml"])
		return 0;
	if (!state.completed["icicles.xhtml"] || !state.completed["sweater.xhtml"])
		return 1;
	return 2;
}

const BULB_SUPPLY_BY_PHASE = [
	[Infinity, 5, 5, 5, 1],
	[Infinity, 15, 15, 10, 4],
	[Infinity, 40, 40, 25, 6],
];

let activeColor = 1;
for (let btn of $$("button[data-color]")) {
	btn.addEventListener("click", () => {
		activeColor = +btn.dataset.color;
		$("button[data-color].active")?.classList.remove("active");
		btn.classList.add("active");
	})
}

if (DEBUG) {
	document.body.classList.add("debug");

	field.addEventListener("click", (e) => {
		if (e.target !== field) return;
		circle(~~(e.offsetX/2) * 2, ~~(e.offsetY/2) * 2);
	});
}


function circle(x, y, { constColor, className = "light" } = {}) {
	let circle = document.createElement("div");
	circle.className = className;
	circle.dataset.x = x;
	circle.dataset.y = y;
	circle.style.left = x + "px";
	circle.style.top = y + "px";
	circle.dataset.color = 0;
	circle[CONST_COLOR] = constColor;
	circles.push(circle);
	field.append(circle);

	let wheelDeltaY = 0;

	if (DEBUG) {
		circle.draggable = true;

		circle.addEventListener("dragstart", (e) => {
			e.dataTransfer.setData("text/plain", circles.indexOf(circle));
		});

		circle.addEventListener("dragover", (e) => {
			e.preventDefault();
		});

		circle.addEventListener("drop", (e) => {
			e.preventDefault();
			edge(circles.indexOf(circle), +e.dataTransfer.getData("text/plain"));
			bump();
		});
	}

	if (!constColor) {
		circle.addEventListener("click", () => {
			if (isAvailable[activeColor]) {
				circle.dataset.color = activeColor;
				save();
			}
		});

		circle.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			circle.dataset.color = 0;
			save();
		});

		circle.addEventListener("wheel", (e) => {
			wheelDeltaY += e.deltaY;
			if (Math.abs(wheelDeltaY) >= 100) {
				e.preventDefault();
				let target = +circle.dataset.color
				for (let i = 0; i < 3; i++) {
					target += Math.sign(wheelDeltaY);
					if (target > 4) target = 1;
					if (target < 1) target = 4;
					if (isAvailable[target]) {
						circle.dataset.color = target;
						save();
						break;
					}
				}
				wheelDeltaY = 0;
			}
		});
	}

	circle.addEventListener("pointerenter", bumpHover);
	circle.addEventListener("pointerleave", () => { wheelDeltaY = 0; bumpHover() });
}

function edge(f, t) {
	let from = circles[f];
	let to = circles[t];
	let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line.setAttribute("x1", from.dataset.x);
	line.setAttribute("y1", from.dataset.y);
	line.setAttribute("x2", to.dataset.x);
	line.setAttribute("y2", to.dataset.y);
	svg.append(line);
	edges.push([from, to, line]);
}

function load() {
	if (state.lights[SCENE]) {
		for (let [i, circle] of circles.filter((c) => !c[CONST_COLOR]).entries()) {
			circle.dataset.color = state.lights[SCENE][i];
		}
	}
	bump();
}

function save() {
	state.lights[SCENE] = circles.filter((c) => !c[CONST_COLOR]).map(c => +c.dataset.color);
	bump();
	state.complete[SCENE] = Boolean($(".checkmark.complete"));
	state.completed[SCENE] ||= state.complete[SCENE];
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

addEventListener("DOMContentLoaded", load);

addEventListener("storage", (e) => {
	if (e.key === STORAGE_KEY) {
		state = JSON.parse(e.newValue);
		load();
	}
});

addEventListener("pageshow", (e) => {
	if (e.persisted) {
		state = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? state;
		load();
	}
});

function bump() {
	for (let circle of circles) {
		if (circle[CONST_COLOR]) {
			circle.dataset.color = circle[CONST_COLOR]();
		}
	}

	for (let [from, to, line] of edges) {
		line.classList.toggle("satisfied", to.dataset.color !== from.dataset.color || to.dataset.color === "0" || from.dataset.color === "0");
	}

	let complete = !circles.some((c) => c.dataset.color === "0") && !$("line:not(.satisfied)");
	$(".checkmark").classList.toggle("complete", complete);
	$("link[rel=icon]").href = complete ? "favicon-complete.png" : "favicon-incomplete.png";

	let counts = [...BULB_SUPPLY_BY_PHASE[phase()]]; // phase, for this purpose, shouldn't change until you return to menu
	for (let arr of Object.values(state.lights)) {
		for (let c of arr) {
			counts[c]--;
		}
	}
	isAvailable = counts.map((c) => c > 0);

	for (let i = 1; i <= 4; i++) {
		$(`button[data-color="${i}"]`)?.replaceChildren(...stringToImgs(`x${counts[i]}`));
	}

	if ($("#toolbar a")) {
		if (phase() === 0 && !$(".checkmark.complete")) { // weird order of operations thing
			$("#toolbar a").style.visibility = "hidden";	
		} else if ($("#toolbar a").style.visibility === "hidden") {
			$("#toolbar a").style.visibility = "";
			$("#toolbar a").animate({ scale: [1, 1.2] }, { duration: 1000, direction: "alternate", iterations: Infinity, easing: "ease-in-out" })
		}
	}
}

function bumpHover() {
	for (let [from, to, line] of edges) {
		line.classList.toggle("hover-adjacent", from.matches(":hover") || to.matches(":hover"));
	}
}

function serialize() {
	let circlesSorted = circles.map((c) => [+c.dataset.x, +c.dataset.y, c])
		.sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
	let circlesIndex = circlesSorted.map((c) => c[2]);
	let edgesResult = edges.map(([f, t]) => [circlesIndex.indexOf(f), circlesIndex.indexOf(t)].sort((a, b) => a - b))
		.sort(([af, at], [bf, bt]) => af - bf || at - bt);
	return circlesSorted.map(([x, y]) => `circle(${x}, ${y});`)
		.concat(edgesResult.map(([f, t]) => `edge(${f}, ${t});`))
		.join("\n");
}
