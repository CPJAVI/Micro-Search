class MicroApp {
    constructor() {
        this.map = null;
        this.markers = [];
        this.currentCampus = null;
        this.userLocation = null;
        this.campusData = [];
        this.nearestMarker = null;
        this.distanceCircle = null;
        this.userMarker = null;
        this.locationRetrieved = false;

        this.init();
    }

    async init() {
        try {
            await this.loadCampusData();
            this.setupEventListeners();
            this.initMap();
            this.loadCampusFromURL();
            this.getUserLocation();
        } catch (error) {
            console.error('Error initializing app:', error);
            this.updateLocationStatus('error', 'Error al cargar los datos');
        }
    }

    async loadCampusData() {
        const response = await fetch('datos.json');
        if (!response.ok) throw new Error('Error cargando datos');
        this.campusData = await response.json();
        this.populateCampusSelector();
    }

    populateCampusSelector() {
        const select = document.getElementById('campusSelect');
        select.innerHTML = '<option value="">Selecciona un campus...</option>';
        this.campusData.campus.forEach(campus => {
            const option = document.createElement('option');
            option.value = campus.id;
            option.textContent = campus.nombre;
            select.appendChild(option);
        });
    }

    setupEventListeners() {
        document.getElementById('campusSelect').addEventListener('change', (e) => {
            const campusId = e.target.value;
            if (campusId) {
                this.selectCampus(campusId);
                this.updateURL(campusId);
            }
        });
    }

    initMap() {
        const defaultCenter = [39.0, -6.5];
        this.map = L.map('map', {
            center: defaultCenter,
            zoom: 15,
            zoomControl: true,
            attributionControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        L.control.scale().addTo(this.map);
    }

    selectCampus(campusId) {
        const campus = this.campusData.campus.find(c => c.id === campusId);
        if (!campus) return;

        this.currentCampus = campus;
        this.clearMarkers();

        document.getElementById('campusName').textContent = campus.nombre;
        document.getElementById('microCount').textContent = `📡 ${campus.microondas.length} microondas`;
        document.getElementById('campus-info').classList.remove('hidden');

        const zoom = this.userLocation ? 17 : 16;
        this.map.setView([campus.centro.lat, campus.centro.lng], zoom);

        this.addMicroMarkers(campus.microondas);

        if (this.userLocation) {
            this.calculateDistances(campus.microondas);
        } else {
            this.showMicroList(campus.microondas);
        }
    }

    createCustomIcon(micro, isNearest = false) {
        const size = isNearest ? 48 : 40;
        const fontSize = isNearest ? 24 : 20;
        
        const divIcon = L.divIcon({
            className: 'custom-marker' + (isNearest ? ' nearest' : ''),
            html: '🍔',
            iconSize: [size, size],
            iconAnchor: [size/2, size/2],
            popupAnchor: [0, -(size/2 + 5)]
        });
        return divIcon;
    }

    addMicroMarkers(microondas) {
        microondas.forEach(micro => {
            const isNearest = this.nearestMarker && this.nearestMarker.id === micro.id;
            const icon = this.createCustomIcon(micro, isNearest);

            const marker = L.marker([micro.lat, micro.lng], {
                icon: icon,
                title: micro.nombre,
                zIndexOffset: isNearest ? 1000 : 0
            }).addTo(this.map);

            // Mostrar distancia en kilómetros en el popup
            let distanciaTexto = '';
            if (this.userLocation) {
                const distKm = this.calculateDistance(
                    this.userLocation.lat, 
                    this.userLocation.lng,
                    micro.lat, 
                    micro.lng
                );
                distanciaTexto = `<br><small>📏 Distancia: ${distKm.toFixed(3)} km</small>`;
            }

            const popupContent = `
                <div style="padding: 4px; min-width: 120px;">
                    <strong>🍔 ${micro.nombre}</strong>
                    ${distanciaTexto}
                </div>
            `;
            marker.bindPopup(popupContent);

            marker.on('click', () => {
                marker.openPopup();
            });

            this.markers.push(marker);
        });
    }

    showMicroList(microondas) {
        const list = document.getElementById('microList');
        list.innerHTML = '';
        const container = document.getElementById('micro-list-container');
        container.classList.remove('hidden');

        let sortedMicroondas = [...microondas];
        if (this.userLocation) {
            sortedMicroondas.sort((a, b) => {
                const distA = this.calculateDistance(
                    this.userLocation.lat,
                    this.userLocation.lng,
                    a.lat,
                    a.lng
                );
                const distB = this.calculateDistance(
                    this.userLocation.lat,
                    this.userLocation.lng,
                    b.lat,
                    b.lng
                );
                return distA - distB;
            });
        }

        sortedMicroondas.forEach((micro, index) => {
            const li = document.createElement('li');
            
            const nameContainer = document.createElement('div');
            nameContainer.className = 'name-container';
            
            const positionSpan = document.createElement('span');
            positionSpan.className = 'position-number';
            positionSpan.textContent = index + 1;
            
            const iconSpan = document.createElement('span');
            iconSpan.className = 'mic-icon';
            iconSpan.textContent = '🍔';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = micro.nombre;
            
            nameContainer.appendChild(positionSpan);
            nameContainer.appendChild(iconSpan);
            nameContainer.appendChild(nameSpan);
            li.appendChild(nameContainer);
            
            if (this.userLocation) {
                const distKm = this.calculateDistance(
                    this.userLocation.lat,
                    this.userLocation.lng,
                    micro.lat,
                    micro.lng
                );
                const badge = document.createElement('span');
                badge.className = 'distance-badge';
                // Mostrar en kilómetros con 3 decimales
                badge.textContent = `${distKm.toFixed(3)} km`;
                
                if (this.nearestMarker && this.nearestMarker.id === micro.id) {
                    badge.classList.add('nearest');
                    li.style.borderLeftColor = '#2ECC71';
                }
                
                li.appendChild(badge);
            }
            
            list.appendChild(li);
        });
    }

    calculateDistances(microondas) {
        let nearest = null;
        let minDist = Infinity;

        microondas.forEach(micro => {
            const dist = this.calculateDistance(
                this.userLocation.lat,
                this.userLocation.lng,
                micro.lat,
                micro.lng
            );
            
            if (dist < minDist) {
                minDist = dist;
                nearest = micro;
            }
        });

        this.nearestMarker = nearest;

        // Mostrar distancia en kilómetros con 3 decimales
        document.getElementById('nearestDistance').innerHTML = 
            `🥇 Más cercano: <span class="highlight">${minDist.toFixed(3)} km</span>`;

        this.drawDistanceCircle();

        if (this.currentCampus) {
            this.clearMarkers();
            this.addMicroMarkers(this.currentCampus.microondas);
            this.showMicroList(this.currentCampus.microondas);
        }
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Radio de la Tierra en kilómetros
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Resultado en kilómetros
    }

    toRad(value) {
        return value * Math.PI / 180;
    }

    drawDistanceCircle() {
        if (this.distanceCircle) {
            this.map.removeLayer(this.distanceCircle);
            this.distanceCircle = null;
        }

        if (!this.userLocation || !this.nearestMarker) return;

        const distKm = this.calculateDistance(
            this.userLocation.lat,
            this.userLocation.lng,
            this.nearestMarker.lat,
            this.nearestMarker.lng
        );

        // El radio del círculo debe estar en metros para Leaflet
        const radiusInMeters = distKm * 1000;

        this.distanceCircle = L.circle([this.userLocation.lat, this.userLocation.lng], {
            color: '#FF6B35',
            weight: 2,
            opacity: 0.3,
            fillColor: '#FF6B35',
            fillOpacity: 0.08,
            radius: radiusInMeters
        }).addTo(this.map);

        if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
        }

        const userIcon = L.divIcon({
            className: 'user-marker',
            html: '📍',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        this.userMarker = L.marker([this.userLocation.lat, this.userLocation.lng], {
            icon: userIcon,
            title: 'Tu ubicación',
            zIndexOffset: 2000
        }).addTo(this.map);

        this.userMarker.bindPopup(`
            <div style="padding: 4px;">
                <strong>📍 Tu ubicación</strong>
                ${this.nearestMarker ? `<br><small>🍔 Microondas más cercano: ${distKm.toFixed(3)} km</small>` : ''}
            </div>
        `);
    }

    getUserLocation() {
        this.updateLocationStatus('loading', '⏳ Obteniendo ubicación...');

        if (!navigator.geolocation) {
            this.updateLocationStatus('error', '⚠️ Tu navegador no soporta geolocalización');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                this.locationRetrieved = true;
                this.updateLocationStatus('success', '📍 Ubicación obtenida ✓');

                if (this.currentCampus) {
                    this.calculateDistances(this.currentCampus.microondas);
                    this.map.setView([this.userLocation.lat, this.userLocation.lng], 17);
                }
            },
            (error) => {
                console.warn('Error obteniendo ubicación:', error);
                let msg = '⚠️ No se pudo obtener ubicación';
                if (error.code === error.PERMISSION_DENIED) {
                    msg = '⚠️ Permiso denegado. Las distancias se muestran sin ordenar.';
                }
                this.updateLocationStatus('error', msg);
                
                if (this.currentCampus) {
                    this.showMicroList(this.currentCampus.microondas);
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 60000
            }
        );
    }

    updateLocationStatus(type, message) {
        const status = document.getElementById('location-status');
        status.textContent = message;
        status.className = type;
    }

    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];
        
        if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
            this.userMarker = null;
        }
        
        if (this.distanceCircle) {
            this.map.removeLayer(this.distanceCircle);
            this.distanceCircle = null;
        }
    }

    updateURL(campusId) {
        const url = new URL(window.location);
        url.searchParams.set('campus', campusId);
        window.history.pushState({}, '', url);
    }

    loadCampusFromURL() {
        const params = new URLSearchParams(window.location.search);
        const campusId = params.get('campus');
        if (campusId) {
            const select = document.getElementById('campusSelect');
            select.value = campusId;
            this.selectCampus(campusId);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new MicroApp();
});