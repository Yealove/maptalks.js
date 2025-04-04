import { createEl, on } from '../core/util/dom';
import Control, { ControlOptionsType } from './Control';
import Map, { MapViewType } from '../map/Map';

/**
 * @property {Object}   options - options
 * @property {String|Object}   [options.position="top-left"]  - position of the rest control.
 * @memberOf control.Reset
 * @instance
 * @example
 * var resetControl = new Reset({
 *     position : 'top-left',
 * }).addTo(map);
 */

const options: ResetOptionsType = {
    position: {
        'top': 156,
        'left': 20
    },
    view: null
};

class Reset extends Control<ResetOptionsTypeSpec> {
    //@internal
    _reset: HTMLDivElement;
    //@internal
    _view: MapViewType;

    /**
     * method to build DOM of the control
     * @param  {Map} map map to build on
     * @return {HTMLDOMElement}
     */
    buildOn() {
        const reset = this._getReset();
        this._appendCustomClass(reset);
        this._reset = reset;

        this._registerDomEvents();

        return reset;
    }

    onAdd() {
        this._view = !this.options.view ? this.getMap().getView() : this.options.view;
    }

    setView(view: MapViewType) {
        this._view = view;
    }

    //@internal
    _getReset() {
        const reset = createEl('div', 'maptalks-reset');
        return reset as HTMLDivElement;
    }

    //@internal
    _registerDomEvents() {
        on(this._reset, 'click', this._resetView, this);
    }

    onRemove() {
        delete this._reset;
        delete this._view;
    }

    //@internal
    _resetView() {
        this.getMap().setView(this._view);
    }
}

Reset.mergeOptions(options);

Map.mergeOptions({
    'resetControl': false
});

Map.addOnLoadHook(function () {
    if (this.options['resetControl']) {
        this.resetControl = new Reset(this.options['resetControl']);
        this.addControl(this.resetControl);
    }
});

export default Reset;

export type ResetOptionsTypeSpec = {
    view?: MapViewType;
};

export type ResetOptionsType = ControlOptionsType & ResetOptionsTypeSpec;
