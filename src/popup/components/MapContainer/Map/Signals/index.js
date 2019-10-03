import React, { useContext } from 'react';
import { observer } from 'mobx-react';
import classnames from 'classnames';
import uniqid from 'uniqid';
import rootStore from '../../../../stores';
import './signals.pcss';

const index = observer(() => {
    const { settingsStore } = useContext(rootStore);

    const mapSignalStatus = classnames({
        'signals--active': settingsStore.extensionEnabled && !settingsStore.ping,
    });

    const fill = settingsStore.extensionEnabled ? 'rgba(0, 76, 51, 0.2)' : 'rgba(50, 50, 50, 0.2)';
    const amountOfMarkers = 4;

    return (
        <g className={`signals ${mapSignalStatus}`}>
            {
                [...Array(amountOfMarkers)].map((e, i) => (
                    <circle
                        key={uniqid()}
                        className={`signals__marker-${i}`}
                        cx={0}
                        cy={0}
                        r={0}
                        fill={fill}
                    />
                ))
            }
        </g>
    );
});

export default index;
