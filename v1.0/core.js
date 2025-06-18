class EventCompositor {
    constructor() {
        /* Constants */
        this.DIRECTION_X = 1
        this.DIRECTION_Y = 2
        this.DIRECTION_XY = 3
        this.__EMPTY__ = []
        /* Id Generation */
        this.__allowed__chars__ = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        this.__total_chars__ = this.__allowed__chars__.length
        this.__code_length__ = 6 // Update as required
        this.__generated_ids__ = 0
        /* -------- */
        this.observations = new Map()
        this.selectedObs = this.__EMPTY__

        const scale = window.devicePixelRatio ?? 1

        let capture = false,
            startX,
            startY,
            prevX,
            prevY,
            prevTimeStamp,
            evStartTimeStamp,
            dx = 0,
            dy = 0;

        let velocitySamples = [], // to get a more accurate dv
            maxSamples = 5 // choose most optimal sample value

        function addSample(x, y, time) {
            velocitySamples.push({ x, y, time })
            if (velocitySamples.length > maxSamples) velocitySamples.shift()
        }

        function getVelocity() {
            const l = velocitySamples.length
            if (l < 2) return { x: 0, y: 0 } // no records

            const initial = velocitySamples[0],
                final = velocitySamples[l - 1]
            velocitySamples = []
            const dt = final.time - initial.time

            if (dt <= 0) return { x: 0, y: 0 }
            return { x: (final.x - initial.x) * scale / dt, y: (final.y - initial.y) * scale / dt }
        }

        this.startEvent = (ev) => {
            ev.preventDefault()
            capture = true
            this.direction = undefined
            prevX = (startX = ev.clientX ?? ev.touches[0].clientX)
            prevY = (startY = ev.clientY ?? ev.touches[0].clientY)
            prevTimeStamp = evStartTimeStamp = performance.now()
            addSample(prevX, prevY, prevTimeStamp)
        }

        this.moveEvent = (ev) => {
            ev.preventDefault()
            if (!capture) return

            const [x, y] = [ev.clientX ?? ev.touches[0].clientX, ev.clientY ?? ev.touches[0].clientY]
            dx = x - startX
            dy = y - startY

            if (!this.direction) {
                // determine the direction for listening event
                const [dx, dy] = [Math.abs(x - startX), Math.abs(y - startY)]

                if (Math.abs(dx - dy) < 2) return

                if (dx >= dy) this.direction = this.DIRECTION_X
                else this.direction = this.DIRECTION_Y
                this.__selectObservations__()

                startX = x
                startY = y

                for (let observation of this.selectedObs) {
                    observation.startObserver({
                        startX,
                        startY,
                        id: observation.id
                    })
                }
            }
            else {
                for (let observation of this.selectedObs) {
                    const timeStamp = performance.now()
                    addSample(x, y, timeStamp) // Adding velocity sample to find non-spiking dv

                    prevTimeStamp = timeStamp
                    observation.moveObserver({
                        startX,
                        startY,
                        x,
                        y,
                        dx,
                        dy,
                        id: observation.id
                    })
                    prevX = x
                    prevY = y
                }
            }
        }

        this.endEvent = () => {
            const evTime = prevTimeStamp - evStartTimeStamp; // total time for event took place

            // non-spiking dv
            const dv = getVelocity()

            for (let observation of this.selectedObs) {
                observation.endObserver({
                    startX,
                    startY,
                    x: prevX,
                    y: prevY,
                    dx,
                    dy,
                    dv, // use this value for more accurate results
                    evTime,
                    id: observation.id
                })
            }
            this.selectedObs = this.__EMPTY__
            capture = false
        }

        window.addEventListener('mousedown', this.startEvent, { passive: false })
        window.addEventListener('touchstart', this.startEvent, { passive: false })

        window.addEventListener('mousemove', this.moveEvent, { passive: false })
        window.addEventListener('touchmove', this.moveEvent, { passive: false })

        window.addEventListener('mouseup', this.endEvent, { passive: false })
        window.addEventListener('mouseleave', this.endEvent, { passive: false })
        window.addEventListener('touchend', this.endEvent, { passive: false })
    }

    __selectObservations__() {
        let currentPriority = -Infinity
        let selectedObs = []

        const checkDirection = (obs_direction) => {
            if (obs_direction === this.direction || obs_direction === this.DIRECTION_XY) return 1
            return 0
        }

        for (let observation of this.observations.values()) {
            if (observation.paused) continue

            const priority = observation.priority, obs_direction = observation.direction

            if (!checkDirection(obs_direction)) continue

            if (priority > currentPriority) {
                currentPriority = priority
                selectedObs = [observation]
            }
            else if (priority == currentPriority) selectedObs.push(observation)
        }

        this.selectedObs = selectedObs
    }

    __generate_observation_id__() {
        let generated_id = 'wn-'
        for (let i = 0; i < this.__code_length__ - this.__generated_ids__.toString().length; i++) generated_id += this.__allowed__chars__[Math.floor(Math.random() * this.__total_chars__)]
        return generated_id + this.__generated_ids__++
    }

    destroy() {
        window.removeEventListener('mousedown', this.mousedown)
        window.removeEventListener('mousemove', this.mousemove)
        window.removeEventListener('mouseup', this.endEvent)
        window.removeEventListener('mouseleave', this.endEvent)
    }

    observe(
        {
            priority = 0,
            startObserver = () => { },
            moveObserver = () => { },
            endObserver = () => { },
            direction = this.DIRECTION_XY,
            paused = false
        } = {}
    ) {
        const id = this.__generate_observation_id__()
        this.observations.set(id, { priority, startObserver, endObserver, moveObserver, direction, id, paused })
        return id
    }

    haltObervation(observation_id) {
        if (this.observations.has(observation_id)) {
            this.observations.get(observation_id).paused = true
            return 1
        }
        return 0
    }

    resumeObservation(observation_id) {
        if (this.observations.has(observation_id)) {
            this.observations.get(observation_id).paused = false
            return 1
        }
        return 0
    }

    unObserve(observation_id) {
        if (this.observations.has(observation_id)) {
            this.observations.delete(observation_id)
            if (this.selectedObs != this.__EMPTY__) this.__selectObservations__()
            return 1
        }
        return 0
    }
}

if(window.WN) WN.register('EventCompositor@v1.0', EventCompositor)
