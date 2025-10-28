document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL VARIABLES & STATE ---
    let chart;
    const colors = ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
    let preloadedImages = {}; // Will store { light: Image, dark: Image }

    // --- DOM ELEMENT SELECTORS ---
    const htmlEl = document.documentElement;
    const girlListContainer = document.getElementById('girl-list-container');
    const addGirlForm = document.getElementById('add-girl-form');
    const newGirlNameInput = document.getElementById('new-girl-name');
    const averageScoresContainer = document.getElementById('average-scores-container');
    const editGirlModalEl = document.getElementById('editGirlModal');
    const editGirlModal = editGirlModalEl ? new bootstrap.Modal(editGirlModalEl) : null;
    const editGirlForm = document.getElementById('edit-girl-form');
    const editGirlIdInput = document.getElementById('edit-girl-id');
    const editGirlNameInput = document.getElementById('edit-girl-name');
    const addPlotForm = document.getElementById('add-plot-form');
    const hotScoreInput = document.getElementById('plot-hot-score');
    const crazyScoreInput = document.getElementById('plot-crazy-score');
    const hotValueDisplay = document.getElementById('hot-value-display');
    const crazyValueDisplay = document.getElementById('crazy-value-display');
    const plotDateInput = document.getElementById('plot-date');
    const plotNotesInput = document.getElementById('plot-notes');
    const editPlotModalEl = document.getElementById('editPlotModal');
    const editPlotModal = editPlotModalEl ? new bootstrap.Modal(editPlotModalEl) : null;
    const editPlotForm = document.getElementById('edit-plot-form');
    const editPlotIdInput = document.getElementById('edit-plot-id');
    const editHotScoreInput = document.getElementById('edit-plot-hot-score');
    const editCrazyScoreInput = document.getElementById('edit-plot-crazy-score');
    const editHotValueDisplay = document.getElementById('edit-hot-value-display');
    const editCrazyValueDisplay = document.getElementById('edit-crazy-value-display');
    const editPlotDateInput = document.getElementById('edit-plot-date');
    const editPlotNotesInput = document.getElementById('edit-plot-notes');
    const deletePlotBtn = document.getElementById('delete-plot-btn');
    const themeToggler = document.getElementById('theme-toggler');
    const lightIcon = document.getElementById('theme-light-icon');
    const darkIcon = document.getElementById('theme-dark-icon');
    const chartCanvas = document.getElementById('hotCrazyChart');
    const themeMetaTag = document.querySelector('meta[name="theme-color"]');
    const isDashboardPage = Boolean(chartCanvas);

    // --- THEME MANAGEMENT ---
    function readCookieTheme() {
        const match = document.cookie.match(/(?:^|; )theme=([^;]+)/);
        return match ? match[1] : null;
    }

    function getSavedTheme() {
        let theme = 'dark';
        try {
            const stored = localStorage.getItem('theme');
            if (stored) {
                theme = stored;
            } else {
                const cookieTheme = readCookieTheme();
                if (cookieTheme) {
                    theme = cookieTheme;
                }
            }
        } catch (err) {
            const fallbackCookieTheme = readCookieTheme();
            if (fallbackCookieTheme) {
                theme = fallbackCookieTheme;
            }
        }
        return theme;
    }

    function persistTheme(theme) {
        try {
            localStorage.setItem('theme', theme);
        } catch (err) {
            // Ignore storage access errors
        }
        document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    }

    function applyTheme(theme) {
        htmlEl.setAttribute('data-bs-theme', theme);
        if (themeMetaTag) {
            themeMetaTag.setAttribute('content', theme === 'dark' ? '#0d1117' : '#f8f9fa');
        }
        if (lightIcon && darkIcon) {
            if (theme === 'dark') {
                darkIcon.classList.remove('d-none');
                lightIcon.classList.add('d-none');
            } else {
                darkIcon.classList.add('d-none');
                lightIcon.classList.remove('d-none');
            }
        }
    }
    const savedTheme = getSavedTheme();
    persistTheme(savedTheme);
    applyTheme(savedTheme);
    if (themeToggler) {
        themeToggler.addEventListener('click', () => {
            const newTheme = htmlEl.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            persistTheme(newTheme);
            applyTheme(newTheme);
            if (isDashboardPage) {
                if (chart) {
                    chart.destroy();
                }
                initializeChart();
                updateChart();
            }
        });
    }

    if (!isDashboardPage) {
        return;
    }

    async function apiRequest(url, method = 'GET', body = null) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken // Send token with each API request
            }
        };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                message: `Request failed with status: ${response.status}`
            }));
            throw new Error(errorData.message || response.statusText);
        }
        return response.status === 204 ? null : response.json();
    }

    // **** Image Inversion and Preloading Logic ****
    function invertImage(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2];
        }
        ctx.putImageData(imageData, 0, 0);
        const invertedImage = new Image();
        invertedImage.src = canvas.toDataURL();
        return invertedImage;
    }

    function preloadAllImages(imageUrls) {
        const promises = Object.entries(imageUrls).map(([name, url]) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { const invertedImg = invertImage(img); resolve({ name, light: img, dark: invertedImg }); };
                img.onerror = () => { console.warn(`Failed to load image: ${name}.`); resolve({ name, light: null, dark: null }); };
                img.src = url;
            });
        });
        return Promise.all(promises).then(results => results.reduce((acc, { name, light, dark }) => { acc[name] = { light, dark }; return acc; }, {}));
    }

    // --- CHART ZONES PLUGIN WITH IMAGES ---
    const chartAreaPainter = {
        id: 'chartAreaPainter',
        beforeDraw(chart, args, options) {
            const { ctx, scales: { x, y } } = chart;
            const { zones, textColor, images, isDarkMode } = options;
            const isMobile = window.innerWidth < 768;
            ctx.save();

            zones.forEach(zone => {
                ctx.beginPath();
                const points = zone.points.map(p => ({
                    x: x.getPixelForValue(p.x),
                    y: y.getPixelForValue(Math.min(10, Math.max(4, p.y))) // Clamp y between 4 and 10
                }));
                if (points.length > 0) {
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i++) {
                        ctx.lineTo(points[i].x, points[i].y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = zone.color;
                    ctx.fill();

                    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                    const imageSet = images ? images[zone.imageKey] : null;
                    const image = imageSet ? (isDarkMode ? imageSet.dark : imageSet.light) : null;

                    if (image && image.complete) {
                        const imgWidth = isMobile ? 48 : 32;
                        const imgHeight = isMobile ? 48 : 32;
                        const textOffset = 22;
                        if (isMobile) {
                            ctx.drawImage(image, centerX - imgWidth / 2, centerY - imgHeight / 2, imgWidth, imgHeight);
                        } else {
                            ctx.drawImage(image, centerX - imgWidth / 2, centerY - (imgHeight / 2) - (textOffset / 2), imgWidth, imgHeight);
                            ctx.font = 'bold 12px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillStyle = textColor;
                            ctx.fillText(zone.label, centerX, centerY + (textOffset / 2));
                        }
                    } else {
                        ctx.font = 'bold 14px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillStyle = textColor;
                        ctx.fillText(zone.label, centerX, centerY);
                    }
                }
            });
            ctx.restore();
        }
    };

    // --- CHART THEME & INITIALIZATION ---
    function getThemeOptions() {
        const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const zones = [
            {
                points: [
                    { x: 0, y: 10 },
                    { x: 5, y: 10 },
                    { x: 5, y: 4 },
                    { x: 0, y: 4 }
                ],
                label: 'No-Go Zone',
                imageKey: 'no-go-zone'
            },
            {
                points: [
                    { x: 5, y: 10 },
                    { x: 10, y: 10 },
                    { x: 8, y: 8.8 },
                    { x: 5, y: 7 }
                ],
                label: 'Danger Zone',
                imageKey: 'danger-zone'
            },
            {
                points: [
                    { x: 5, y: 7 },
                    { x: 8, y: 8.8 },
                    { x: 8, y: 4 },
                    { x: 5, y: 4 }
                ],
                label: 'Fun Zone',
                imageKey: 'fun-zone'
            },
            {
                points: [
                    { x: 8, y: 8.8 },
                    { x: 10, y: 10 },
                    { x: 10, y: 7 },
                    { x: 8, y: 7 }
                ],
                label: 'Date Zone',
                imageKey: 'date-zone'
            },
            {
                points: [
                    { x: 8, y: 7 },
                    { x: 10, y: 7 },
                    { x: 10, y: 5 },
                    { x: 8, y: 5 }
                ],
                label: 'Wife Zone',
                imageKey: 'wife-zone'
            },
            {
                points: [
                    { x: 8, y: 5 },
                    { x: 10, y: 5 },
                    { x: 10, y: 4 },
                    { x: 8, y: 4 }
                ],
                label: 'Unicorn Zone',
                imageKey: 'unicorn-zone'
            }
        ];
        if (isDarkMode) {
            return {
                isDarkMode: true,
                gridColor: 'rgba(255, 255, 255, 0.1)',
                textColor: '#ccc',
                lineColor: '#ccc',
                zones: zones.map(z => ({
                    ...z,
                    color: ['rgba(110, 45, 57, 0.4)', 'rgba(217, 3, 3, 0.3)', 'rgba(255, 159, 64, 0.3)', 'rgba(75, 192, 192, 0.3)', 'rgba(54, 162, 235, 0.3)', 'rgba(153, 102, 255, 0.3)'][zones.indexOf(z)]
                }))
            };
        } else {
            return {
                isDarkMode: false,
                gridColor: 'rgba(0, 0, 0, 0.1)',
                textColor: '#666',
                lineColor: '#aaa',
                zones: zones.map(z => ({
                    ...z,
                    color: ['rgba(231, 168, 178, 0.4)', 'rgba(243, 134, 134, 0.4)', 'rgba(255, 209, 148, 0.4)', 'rgba(153, 227, 227, 0.4)', 'rgba(142, 195, 235, 0.4)', 'rgba(204, 184, 255, 0.4)'][zones.indexOf(z)]
                }))
            };
        }
    }

    function initializeChart() {
        if (!chartCanvas) { return; }
        const themeOptions = getThemeOptions();
        const ctx = chartCanvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'scatter', plugins: [chartAreaPainter],
            data: { datasets: [ { type: 'line', label: 'Hot-Crazy Line', data: [{x: 0, y: 4}, {x: 10, y: 10}], borderColor: themeOptions.lineColor, borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0.1, order: 1 } ] },
            options: { maintainAspectRatio: false, plugins: { chartAreaPainter: { zones: themeOptions.zones, textColor: themeOptions.textColor, images: preloadedImages, isDarkMode: themeOptions.isDarkMode }, tooltip: { filter: (item) => item.datasetIndex !== 0, callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) { label += ': '; } label += `(Hot: ${context.parsed.x}, Crazy: ${context.parsed.y})`; return label; }, afterBody: function(context) { const plotData = context[0].raw; const notes = plotData.notes; if (notes) { return '\nNotes: ' + notes; } return ''; } } } }, responsive: true, scales: { x: { min: 0, max: 10, title: { display: true, text: 'Hot', color: themeOptions.textColor }, grid: { color: themeOptions.gridColor }, ticks: { color: themeOptions.textColor } }, y: { min: 4, max: 10, title: { display: true, text: 'Crazy', color: themeOptions.textColor }, grid: { color: themeOptions.gridColor }, ticks: { color: themeOptions.textColor } } }, onClick: handleChartClick }
        });
    }

    // --- DATA & EVENT HANDLER FUNCTIONS ---
    function toggleAddPlotForm(enabled) {
        const fieldset = addPlotForm.querySelector('fieldset') || addPlotForm;
        Array.from(fieldset.elements).forEach(el => el.disabled = !enabled);
        if (enabled) { addPlotForm.style.opacity = '1'; }
        else { addPlotForm.style.opacity = '0.5'; }
    }

    async function updateChart() {
        try {
            const selectedGirlIds = Array.from(document.querySelectorAll('.girl-checkbox:checked')).map(cb => cb.value);
            const datasets = [];
            for (const [index, id] of selectedGirlIds.entries()) {
                const plots = await apiRequest(`/api/girls/${id}/plots`);
                const girlName = document.querySelector(`label[for="girl-${id}"]`).textContent.trim();
                datasets.push({ label: girlName, data: plots, backgroundColor: colors[index % colors.length], order: 2 });
            }
            chart.data.datasets = [chart.data.datasets[0], ...datasets];
            chart.update();
            updateAverages();
            toggleAddPlotForm(selectedGirlIds.length === 1);
        } catch (error) {
            alert(`Error updating chart: ${error.message}`);
        }
    }

    async function fetchAndRenderGirls() {
        try {
            const girls = await apiRequest('/api/girls');
            girlListContainer.innerHTML = girls.length ? '' : '<p class="text-muted">No girls added yet.</p>';
            girls.forEach(girl => {
                const div = document.createElement('div');
                div.className = 'form-check d-flex justify-content-between align-items-center mb-2';
                div.innerHTML = `<div><input class="form-check-input girl-checkbox" type="checkbox" value="${girl.id}" id="girl-${girl.id}"><label class="form-check-label" for="girl-${girl.id}">${girl.name}</label></div><div><button class="btn btn-sm btn-outline-primary edit-girl-btn" data-id="${girl.id}" data-name="${girl.name}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger delete-girl-btn" data-id="${girl.id}"><i class="bi bi-trash"></i></button></div>`;
                girlListContainer.appendChild(div);
            });
        } catch(error) {
            alert(`Error fetching girls: ${error.message}`);
            girlListContainer.innerHTML = '<p class="text-danger">Could not load girls list.</p>';
        }
    }

    function getZoneForPoint(hot, crazy) {
        const themeOptions = getThemeOptions();
        const zones = themeOptions.zones;
        for (const zone of zones) {
            let isInside = false;
            for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
                const xi = zone.points[i].x, yi = zone.points[i].y;
                const xj = zone.points[j].x, yj = zone.points[j].y;
                const intersect = ((yi > crazy) !== (yj > crazy))
                    && (hot < (xj - xi) * (crazy - yi) / (yj - yi) + xi);
                if (intersect) isInside = !isInside;
            }
            if (isInside) return zone;
        }
        return null; // Should not happen if zones cover the whole chart
    }

    async function updateAverages() {
        const selectedGirlIds = Array.from(document.querySelectorAll('.girl-checkbox:checked')).map(cb => cb.value);
        if (!selectedGirlIds.length) {
            averageScoresContainer.innerHTML = '<p class="text-muted">Select a girl to see average scores.</p>';
            return;
        }
        try {
            const averages = await apiRequest(`/api/averages?girl_ids=${selectedGirlIds.join(',')}`);
            averageScoresContainer.innerHTML = '';
            selectedGirlIds.forEach(id => {
                const girlName = document.querySelector(`label[for="girl-${id}"]`).textContent.trim();
                const data = averages[id];
                const p = document.createElement('p');
                p.className = 'd-flex align-items-center mb-2';

                if (data) {
                    const zone = getZoneForPoint(data.avg_hot, data.avg_crazy);
                    const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';

                    let iconHtml = '';
                    if (zone && zone.imageKey && preloadedImages[zone.imageKey]) {
                        const imageSet = preloadedImages[zone.imageKey];
                        const image = imageSet ? (isDarkMode ? imageSet.dark : imageSet.light) : null;
                        if (image && image.complete) {
                            iconHtml = `<img src="${image.src}" alt="${zone.label} icon" width="20" height="20" class="mx-2">`;
                        }
                    }

                    const zoneLabel = zone ? zone.label : '';

                    // Order: Name, Icon, Zone
                    p.innerHTML = `<strong>${girlName}:</strong> ${iconHtml} ${zoneLabel}`;
                } else {
                    p.innerHTML = `<strong>${girlName}:</strong> No data points yet.`;
                }
                averageScoresContainer.appendChild(p);
            });
        } catch(error) {
            alert(`Error fetching averages: ${error.message}`);
            averageScoresContainer.innerHTML = '<p class="text-danger">Could not load averages.</p>';
        }
    }

    addGirlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = newGirlNameInput.value.trim();
        if (name) {
            try {
                await apiRequest('/api/girls', 'POST', { name });
                newGirlNameInput.value = '';
                await fetchAndRenderGirls();
            } catch (error) {
                alert(`Error adding girl: ${error.message}`);
            }
        }
    });

    girlListContainer.addEventListener('click', async (e) => {
        const checkbox = e.target.closest('.girl-checkbox');
        const deleteBtn = e.target.closest('.delete-girl-btn');
        const editBtn = e.target.closest('.edit-girl-btn');
        if (checkbox) {
            updateChart();
        }
        if (deleteBtn) {
            if (confirm('Are you sure you want to delete this girl and all her data?')) {
                try {
                    await apiRequest(`/api/girls/${deleteBtn.dataset.id}`, 'DELETE');
                    await fetchAndRenderGirls();
                    updateChart();
                } catch (error) {
                    alert(`Error deleting girl: ${error.message}`);
                }
            }
        }
        if (editBtn) {
            editGirlIdInput.value = editBtn.dataset.id;
            editGirlNameInput.value = editBtn.dataset.name;
            editGirlModal.show();
        }
    });

    editGirlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = editGirlNameInput.value.trim();
        if (name) {
            try {
                await apiRequest(`/api/girls/${editGirlIdInput.value}`, 'PUT', { name });
                editGirlModal.hide();
                await fetchAndRenderGirls();
                updateChart();
            } catch (error) {
                alert(`Error updating girl: ${error.message}`);
            }
        }
    });

    async function handleChartClick(evt) {
        const elements = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true).filter(e => e.datasetIndex !== 0);
        if (elements.length > 0) {
            const { datasetIndex, index } = elements[0];
            const plotData = chart.data.datasets[datasetIndex].data[index];
            editPlotIdInput.value = plotData.id; editHotScoreInput.value = plotData.x; editCrazyScoreInput.value = plotData.y;
            editHotValueDisplay.textContent = plotData.x; editCrazyValueDisplay.textContent = plotData.y;
            editPlotDateInput.value = plotData.date.slice(0, 16); editPlotNotesInput.value = plotData.notes;
            editPlotModal.show();
        } else {
            const selectedGirlIds = Array.from(document.querySelectorAll('.girl-checkbox:checked')).map(cb => cb.value);
            if (selectedGirlIds.length !== 1) {
                alert("Please select exactly one girl from the list to add a point for."); return;
            }
            const hotScore = parseFloat(chart.scales.x.getValueForPixel(evt.offsetX).toFixed(1));
            const crazyScore = parseFloat(chart.scales.y.getValueForPixel(evt.offsetY).toFixed(1));
            if (hotScore >= 0 && hotScore <= 10 && crazyScore >= 4 && crazyScore <= 10) {
                if (confirm(`Add point (Hot: ${hotScore}, Crazy: ${crazyScore}) for the selected girl?`)) {
                    try {
                        await apiRequest('/api/plots', 'POST', { girl_id: parseInt(selectedGirlIds[0]), hot_score: hotScore, crazy_score: crazyScore, plot_date: new Date().toISOString(), notes: '' });
                        updateChart();
                    } catch (error) {
                        alert(`Error adding point: ${error.message}`);
                    }
                }
            }
        }
    }

    addPlotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedGirlIds = Array.from(document.querySelectorAll('.girl-checkbox:checked')).map(cb => cb.value);
        if (selectedGirlIds.length !== 1) {
            alert("Please select exactly one girl from the list to add a point for."); return;
        }
        try {
            await apiRequest('/api/plots', 'POST', { girl_id: parseInt(selectedGirlIds[0]), hot_score: parseFloat(hotScoreInput.value), crazy_score: parseFloat(crazyScoreInput.value), plot_date: plotDateInput.value ? new Date(plotDateInput.value).toISOString() : new Date().toISOString(), notes: plotNotesInput.value.trim() });
            updateChart();
            plotNotesInput.value = '';
            plotDateInput.value = '';
        } catch (error) {
            alert(`Error adding point: ${error.message}`);
        }
    });

    editPlotForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const plotData = { hot_score: parseFloat(editHotScoreInput.value), crazy_score: parseFloat(editCrazyScoreInput.value), plot_date: editPlotDateInput.value ? new Date(editPlotDateInput.value).toISOString() : new Date().toISOString(), notes: editPlotNotesInput.value.trim() };
        try {
            await apiRequest(`/api/plots/${editPlotIdInput.value}`, 'PUT', plotData);
            editPlotModal.hide();
            updateChart();
        } catch (error) {
            alert(`Error updating point: ${error.message}`);
        }
    });

    if (deletePlotBtn) {
        deletePlotBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to permanently delete this data point?')) {
                try {
                    await apiRequest(`/api/plots/${editPlotIdInput.value}`, 'DELETE');
                    editPlotModal.hide();
                    updateChart();
                } catch (error) {
                    alert(`Error deleting point: ${error.message}`);
                }
            }
        });
    }

    [hotScoreInput, crazyScoreInput, editHotScoreInput, editCrazyScoreInput].forEach(input => {
        input.addEventListener('input', () => {
            hotValueDisplay.textContent = hotScoreInput.value; crazyValueDisplay.textContent = crazyScoreInput.value;
            editHotValueDisplay.textContent = editHotScoreInput.value; editCrazyValueDisplay.textContent = editCrazyScoreInput.value;
        });
    });

    // --- INITIALIZATION ---
    async function initializeApp() {
        const imageUrls = { 'no-go-zone': '/static/images/no-go-zone.png', 'danger-zone': '/static/images/danger-zone.png', 'fun-zone': '/static/images/fun-zone.png', 'date-zone': '/static/images/date-zone.png', 'wife-zone': '/static/images/wife-zone.png', 'unicorn-zone': '/static/images/unicorn-zone.png', };
        preloadedImages = await preloadAllImages(imageUrls);
        initializeChart();
        await fetchAndRenderGirls();
        toggleAddPlotForm(false);
    }

    initializeApp();
});
