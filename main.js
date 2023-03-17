const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth *.98 ;
canvas.height = window.innerHeight *.98;

const ctx = canvas.getContext('2d');

const contextMenu = document.getElementById('context-menu');
const stackButton = document.getElementById('stack-button');
const deleteButton = document.getElementById('delete-button');

const alignLeftButton = document.getElementById('aleft-button');
const alignRightButton = document.getElementById('aright-button');
const alignTopButton = document.getElementById('atop-button');
const alignBottomButton = document.getElementById('abottom-button');
const alignHorizontalCenterButton = document.getElementById('ahc-button');
const alignVerticalCenterButton = document.getElementById('avc-button');

const colorPicker = document.getElementById('color-picker');

let items = [];
let dragging = false;
let connecting = false;
let dragStart = null;
let editingElement = null;
let selecting = false;
let selectionStart = null;
let selectionRect = null;
let connectionStart = null;
let connectionEnd = null;
let hoveredItem = null;
let blinkColor = '#f5efdf';
let padding = 8;
let paddingBetween = 2;
let itemIdCounter = 0;
let shiftPressed = false;

colorPicker.addEventListener('change', (e) => {
    const selectedItems = items.filter((item) => item.selected);
    const newColor = e.target.value;

    selectedItems.forEach((item) => {
        item.backgroundColor = newColor;
    });

    render();
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const selectedItems = items.filter((item) => item.selected);

    if (dragging) {
        dragging = false;
    }

    if (selectedItems.length > 0) {
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
    }
});

function moveItemToFront(item) {
    const index = items.indexOf(item);
    if (index > -1) {
        items.splice(index, 1);
        items.push(item);
    }
}

function alignItems(alignment) {
    const selectedItems = items.filter((item) => item.selected);
    if (selectedItems.length === 0) {
        return;
    }

    const alignBy = {
        left: (item) => item.x - item.width / 2,
        right: (item) => item.x + item.width / 2,
        top: (item) => item.y - item.height / 2,
        bottom: (item) => item.y + item.height / 2,
        horizontalCenter: (item) => item.x,
        verticalCenter: (item) => item.y,
    };

    if (!alignBy[alignment]) {
        return;
    }

    const reference = alignBy[alignment](selectedItems[0]);

    selectedItems.slice(1).forEach((item) => {
        switch (alignment) {
            case 'left':
                item.x = reference + item.width / 2;
                break;
            case 'right':
                item.x = reference - item.width / 2;
                break;
            case 'top':
                item.y = reference + item.height / 2;
                break;
            case 'bottom':
                item.y = reference - item.height / 2;
                break;
            case 'horizontalCenter':
                item.x = reference;
                break;
            case 'verticalCenter':
                item.y = reference;
                break;
        }
    });

    contextMenu.style.display = 'none';
    dragging = false;
    render();
}

alignLeftButton.addEventListener('click', () => alignItems('left'));
alignRightButton.addEventListener('click', () => alignItems('right'));
alignTopButton.addEventListener('click', () => alignItems('top'));
alignBottomButton.addEventListener('click', () => alignItems('bottom'));
alignHorizontalCenterButton.addEventListener('click', () => alignItems('horizontalCenter'));
alignVerticalCenterButton.addEventListener('click', () => alignItems('verticalCenter'));

deleteButton.addEventListener('click', deleteSelectedItems);

function deleteSelectedItems() {
    const selectedItems = items.filter((item) => item.selected);
    if (selectedItems.length === 0) {
        return;
    }

    // Remove connections to the deleted items
    items.forEach((item) => {
        item.connections = item.connections.filter(
            (connection) => !connection.selected
        );
    });

    items = items.filter((item) => !item.selected);

    contextMenu.style.display = 'none';
    dragging = false;
    render();
}

stackButton.addEventListener('click', () => {
    const selectedItems = items.filter((item) => item.selected);

    if (selectedItems.length === 0) {
        return;
    }

    // Sort items based on their y position
    selectedItems.sort((a, b) => a.y - b.y);

    // Find the leftmost x position among the selected items
    const leftX = Math.min(...selectedItems.map((item) => item.x - item.width / 2 - padding));

    let stackY = selectedItems[0].y - selectedItems[0].height / 2 - padding;

    selectedItems.forEach((item) => {
        stackY += item.height / 2 + padding;
        item.y = stackY;
        item.x = leftX + item.width / 2 + padding; // Align items to the left
        stackY += item.height / 2 + padding + paddingBetween; // Additional 2px padding
    });

    contextMenu.style.display = 'none';
    dragging = false;
    render();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
        contextMenu.style.display = 'none';
    }
});

function getCursorBlinkState() {
    return Math.floor(Date.now() / 500) % 2 === 0;
}

function renderCursorBlink() {
    if (editingElement) {
        const blinkState = getCursorBlinkState();
        if (blinkState) {
            ctx.fillStyle = 'black';
            const textWidth = ctx.measureText(editingElement.text).width;
            ctx.fillRect(editingElement.x + textWidth / 2, editingElement.y - 8, 2, 16);
        }
    }
    setTimeout(render, 500);
}

function getLinePoints(item1, item2) {
    const padding = 6;

    const possiblePoints1 = [
        { x: item1.x, y: item1.y - item1.height / 2 - padding }, // top-middle
        { x: item1.x, y: item1.y + item1.height / 2 + padding }, // bottom-middle
        { x: item1.x - item1.width / 2 - padding, y: item1.y }, // left-middle
        { x: item1.x + item1.width / 2 + padding, y: item1.y }, // right-middle
    ];

    const possiblePoints2 = [
        { x: item2.x, y: item2.y - item2.height / 2 - padding }, // top-middle
        { x: item2.x, y: item2.y + item2.height / 2 + padding }, // bottom-middle
        { x: item2.x - item2.width / 2 - padding, y: item2.y }, // left-middle
        { x: item2.x + item2.width / 2 + padding, y: item2.y }, // right-middle
    ];

    let minDistance = Infinity;
    let bestPoints = {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
    };

    possiblePoints1.forEach((point1) => {
        possiblePoints2.forEach((point2) => {
            const dx = Math.abs(point1.x - point2.x);
            const dy = Math.abs(point1.y - point2.y);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                bestPoints = {
                    x1: point1.x,
                    y1: point1.y,
                    x2: point2.x,
                    y2: point2.y,
                };
            }
        });
    });

    return bestPoints;
}

canvas.addEventListener('mousedown', (e) => {
    const clickedItem = items.find((item) => ctx.isPointInPath(item.path, e.clientX, e.clientY));
    if (clickedItem) {
        if (!e.shiftKey) {
            dragging = true;
            dragStart = {
                x: e.clientX,
                y: e.clientY
            };
            if (!clickedItem.selected) {
                items.forEach((item) => {
                    item.selected = false;
                });
                clickedItem.selected = true;
				moveItemToFront(clickedItem); // Move the clicked item to the end of the array
            }
        } else {
            connecting = true;
            connectionStart = clickedItem;
            return;
        }
    } else {
        selecting = true;
        selectionStart = {
            x: e.clientX,
            y: e.clientY
        };
        items.forEach((item) => {
            item.selected = false;
        });
        editingElement = null;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;

        items
            .filter((item) => item.selected)
            .forEach((item) => {
                item.x += dx;
                item.y += dy;
            });

        dragStart = {
            x: e.clientX,
            y: e.clientY
        };
    } else if (selecting) {
        const x = Math.min(e.clientX, selectionStart.x);
        const y = Math.min(e.clientY, selectionStart.y);
        const width = Math.abs(e.clientX - selectionStart.x);
        const height = Math.abs(e.clientY - selectionStart.y);

        selectionRect = {
            x,
            y,
            width,
            height
        };

        items.forEach((item) => {
            const itemLeft = item.x - item.width / 2 - padding;
            const itemRight = item.x + item.width / 2 + padding;
            const itemTop = item.y - item.height / 2 - padding;
            const itemBottom = item.y + item.height / 2 + padding;

            const selectionLeft = selectionRect.x;
            const selectionRight = selectionRect.x + selectionRect.width;
            const selectionTop = selectionRect.y;
            const selectionBottom = selectionRect.y + selectionRect.height;

            const isIntersecting =
                itemLeft < selectionRight &&
                itemRight > selectionLeft &&
                itemTop < selectionBottom &&
                itemBottom > selectionTop;

            item.selected = isIntersecting;
        });
    } else if (connecting) {
        connectionEnd = {
            x: e.clientX,
            y: e.clientY
        };
    }

    if (connecting) {
        connectionEnd = {
            x: e.clientX,
            y: e.clientY
        };
    }

    hoveredItem = items.find((item) => ctx.isPointInPath(item.path, e.clientX, e.clientY));
    render();
});

canvas.addEventListener('mouseup', (e) => {
	e.preventDefault();

    const clickedItem = items.find((item) => ctx.isPointInPath(item.path, e.clientX, e.clientY));

    if (dragging) {
        dragging = false;
    } else if (selecting) {
        selecting = false;
        selectionRect = null;
    } else if (connecting) {
    if (clickedItem) {
        const selectedItems = items.filter((item) => item.selected);

        if (selectedItems.length > 0) {
            selectedItems.forEach((item) => {
                if (item !== clickedItem) {
                    const index = item.connections.indexOf(clickedItem);
                    if (index === -1) {
                        item.connections.push(clickedItem);
                        clickedItem.connections.push(item);
                    }
                }
            });
        } else if (connectionStart !== clickedItem) {
            const index = connectionStart.connections.indexOf(clickedItem);
            if (index === -1) {
                connectionStart.connections.push(clickedItem);
                clickedItem.connections.push(connectionStart);
            } else {
                connectionStart.connections.splice(index, 1);
                clickedItem.connections.splice(clickedItem.connections.indexOf(connectionStart), 1);
            }
        }
    }
    connecting = false;
    connectionStart = null;
    connectionEnd = null;
}    render();
});

canvas.addEventListener('dblclick', (e) => {
    const clickedItem = items.find((item) => ctx.isPointInPath(item.path, e.clientX, e.clientY));
    if (clickedItem) {
        editingElement = clickedItem;
    } else {
        const newItem = {
            id: itemIdCounter++,
            x: e.clientX,
            y: e.clientY,
            text: '',
            connections: [],
            selected: false,
        };
        items.push(newItem);
        editingElement = newItem;
    }

    render();
});

canvas.addEventListener('keydown', (e) => {
    if (e.code === 'Backspace' && editingElement == null) {
        deleteSelectedItems();
		render();
    }
    if (editingElement && (e.key === 'Enter' || e.which === 27 )) {
        if (e.shiftKey) {
            const newItem = {
				id: itemIdCounter++,
                x: editingElement.x,
                y: editingElement.y + editingElement.height + (padding*2) + paddingBetween,
                text: '',
                connections: [],
                selected: false,
            };
            items.push(newItem);
            editingElement = newItem;
        } else {
			editingElement.selected = false;
            editingElement = null;
        }
    } else if (editingElement && e.key.length === 1) {
        editingElement.text += e.key;
    } else if (editingElement && e.key === 'Backspace') {
        editingElement.text = editingElement.text.slice(0, -1);
    }

    render();
});

function roundedRect(x, y, width, height, radius) {
    const path = new Path2D();
    path.moveTo(x + radius, y);
    path.lineTo(x + width - radius, y);
    path.arcTo(x + width, y, x + width, y + radius, radius);
    path.lineTo(x + width, y + height - radius);
    path.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    path.lineTo(x + radius, y + height);
    path.arcTo(x, y + height, x, y + height - radius, radius);
    path.lineTo(x, y + radius);
    path.arcTo(x, y, x + radius, y, radius);
    return path;
}

function render() {
	const connectedPairs = new Set();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    items.forEach((item) => {
		for (const connection of item.connections) {
			const pairId = [item.id, connection.id].sort((a, b) => a - b).join('-');
			if (!connectedPairs.has(pairId)) {
				connectedPairs.add(pairId);
				ctx.beginPath();
				ctx.moveTo(item.x + item.width / 2, item.y + item.height / 2);
				ctx.lineTo(connection.x + connection.width / 2, connection.y + connection.height / 2);
				ctx.setLineDash([4, 4]);
				ctx.strokeStyle = 'black';
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}

        ctx.font = '16px sans-serif';
        const textWidth = ctx.measureText(item.text).width;
        const textHeight = 16;
        item.path = new Path2D();
		//item.path.rect(item.x - textWidth / 2 - padding, item.y - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
        item.path = roundedRect(item.x - textWidth / 2 - padding, item.y - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2, 10);

		// blink
		//
		const itemBackgroundColor = '#f5f5f5';
		if(item.backgroundColor === undefined) item.backgroundColor = '#f5f5f5';
        //item.backgroundColor = item === hoveredItem ? blinkColor : item.backgroundColor;
        ctx.fillStyle = item.backgroundColor;
        ctx.fill(item.path);

        item.width = textWidth;
        item.height = textHeight;

		ctx.fillStyle = 'black';
		ctx.fillText(item.text, item.x - textWidth / 2, item.y + textHeight / 2 - ((padding/2)*.7));

		if (item.selected) {
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.strokeRect(item.x - textWidth / 2 - 6, item.y - textHeight / 2 - 6, textWidth + 12, textHeight + 12);
			ctx.setLineDash([]);
		}

    });

    if (connecting && connectionStart && connectionEnd) {
        const points = getLinePoints(connectionStart, {
            x: connectionEnd.x,
            y: connectionEnd.y,
            width: 0,
            height: 0
        });
        ctx.beginPath();
        ctx.moveTo(points.x1, points.y1);
        ctx.lineTo(points.x2, points.y2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (selecting && selectionRect) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            selectionRect.x,
            selectionRect.y,
            selectionRect.width,
            selectionRect.height
        );
        ctx.setLineDash([]);
    }

    renderCursorBlink();
}

canvas.tabIndex = 1000;
canvas.style.outline = 'none';
canvas.focus();
render();
