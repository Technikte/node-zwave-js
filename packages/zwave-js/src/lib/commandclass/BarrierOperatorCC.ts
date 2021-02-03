import type { Maybe, MessageOrCCLogEntry, ValueID } from "@zwave-js/core";
import {
	CommandClasses,
	enumValuesToMetadataStates,
	parseBitMask,
	validatePayload,
	ValueMetadata,
	ZWaveError,
	ZWaveErrorCodes,
} from "@zwave-js/core";
import { getEnumMemberName } from "@zwave-js/shared";
import type { Driver } from "../driver/Driver";
import {
	CCAPI,
	SetValueImplementation,
	SET_VALUE,
	throwUnsupportedProperty,
	throwWrongValueType,
} from "./API";
import {
	API,
	CCCommand,
	CCCommandOptions,
	ccValue,
	ccValueMetadata,
	CommandClass,
	commandClass,
	CommandClassDeserializationOptions,
	expectedCCResponse,
	gotDeserializationOptions,
	implementedVersion,
} from "./CommandClass";

function getStateValueId(endpoint?: number): ValueID {
	return {
		commandClass: CommandClasses["Barrier Operator"],
		endpoint,
		property: "state",
	};
}

// All the supported commands
export enum BarrierOperatorCommand {
	Set = 0x01,
	Get = 0x02,
	Report = 0x03,
	CapabilitiesGet = 0x04,
	CapabilitiesReport = 0x05,
	EventSet = 0x06,
	EventGet = 0x07,
	EventReport = 0x08,
}

/**
 * @publicAPI
 */
export enum BarrierState {
	Closed = 0x00,
	Closing = 0xfc,
	Stopped = 0xfd,
	Opening = 0xfe,
	Open = 0xff,
}

// @publicAPI
export enum SignalType {
	Audible = 0x01,
	Visual = 0x02,
}

// @publicAPI
export enum SignalState {
	OFF = 0x00,
	ON = 0xff,
}

@API(CommandClasses["Barrier Operator"])
export class BarrierOperatorCCAPI extends CCAPI {
	public supportsCommand(cmd: BarrierOperatorCommand): Maybe<boolean> {
		switch (cmd) {
			case BarrierOperatorCommand.Get:
			case BarrierOperatorCommand.Set:
			case BarrierOperatorCommand.CapabilitiesGet:
			case BarrierOperatorCommand.EventGet:
			case BarrierOperatorCommand.EventSet:
				return true; // This is mandatory
		}
		return super.supportsCommand(cmd);
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	public async get() {
		this.assertSupportsCommand(
			BarrierOperatorCommand,
			BarrierOperatorCommand.Get,
		);

		const cc = new BarrierOperatorCCGet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
		});
		const response = (await this.driver.sendCommand<BarrierOperatorCCReport>(
			cc,
			this.commandOptions,
		))!;
		return {
			state: response.state,
			position: response.position,
		};
	}

	public async set(
		state: BarrierState.Open | BarrierState.Closed,
	): Promise<void> {
		this.assertSupportsCommand(
			BarrierOperatorCommand,
			BarrierOperatorCommand.Set,
		);

		const cc = new BarrierOperatorCCSet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
			state,
		});
		await this.driver.sendCommand(cc, this.commandOptions);

		if (this.isSinglecast()) {
			// Refresh the current value
			await this.get();
		}
	}

	public async getCapabilities(): Promise<readonly SignalType[]> {
		this.assertSupportsCommand(
			BarrierOperatorCommand,
			BarrierOperatorCommand.CapabilitiesGet,
		);

		const cc = new BarrierOperatorCCCapabilitiesGet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
		});
		const response = (await this.driver.sendCommand<BarrierOperatorCCCapabilitiesReport>(
			cc,
			this.commandOptions,
		))!;
		return response.supportedSignalTypes;
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	public async getEvent(signalType: SignalType) {
		this.assertSupportsCommand(
			BarrierOperatorCommand,
			BarrierOperatorCommand.EventGet,
		);

		const cc = new BarrierOperatorCCEventGet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
			signalType,
		});
		const response = (await this.driver.sendCommand<BarrierOperatorCCEventReport>(
			cc,
			this.commandOptions,
		))!;
		return {
			signalState: getEnumMemberName(SignalState, response.state),
		};
	}

	public async setEvent(
		signalType: SignalType,
		signalState: SignalState,
	): Promise<void> {
		this.assertSupportsCommand(
			BarrierOperatorCommand,
			BarrierOperatorCommand.EventSet,
		);

		const cc = new BarrierOperatorCCEventSet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
			signalType,
			signalState,
		});

		await this.driver.sendCommand(cc, this.commandOptions);

		if (this.isSinglecast()) {
			await this.getEvent(signalType);
		}
	}

	protected [SET_VALUE]: SetValueImplementation = async (
		{ property },
		value,
	): Promise<void> => {
		if (typeof value !== "number") {
			throwWrongValueType(this.ccId, property, "number", typeof value);
		} else {
			switch (property) {
				case "state":
				case "signalType":
				case "signalState":
					await this.set(value);
					break;
				default:
					throwUnsupportedProperty(this.ccId, property);
			}
		}
	};
}

@commandClass(CommandClasses["Barrier Operator"])
@implementedVersion(1)
export class BarrierOperatorCC extends CommandClass {
	declare ccCommand: BarrierOperatorCommand;
}

interface BarrierOperatorCCSetOptions extends CCCommandOptions {
	state: BarrierState.Open | BarrierState.Closed;
}

@CCCommand(BarrierOperatorCommand.Set)
export class BarrierOperatorCCSet extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options:
			| CommandClassDeserializationOptions
			| BarrierOperatorCCSetOptions,
	) {
		super(driver, options);
		if (gotDeserializationOptions(options)) {
			throw new ZWaveError(
				`${this.constructor.name}: deserialization not implemented`,
				ZWaveErrorCodes.Deserialization_NotImplemented,
			);
		} else {
			this.state = options.state;
		}
	}

	public state: BarrierState.Open | BarrierState.Closed;

	public serialize(): Buffer {
		this.payload = Buffer.from([this.state]);
		return super.serialize();
	}

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: { "target state": this.state },
		};
	}
}

@CCCommand(BarrierOperatorCommand.Report)
export class BarrierOperatorCCReport extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options: CommandClassDeserializationOptions,
	) {
		super(driver, options);

		validatePayload(this.payload.length >= 1);

		// return values state and position value
		// if state is 0 - 99 or FF (100%) return the appropriate values.
		// if state is different just use the table and
		// return undefined position

		const payloadValue = this.payload[0];
		this.state = payloadValue;
		this.position = undefined;
		if (payloadValue <= 99) {
			this.position = payloadValue;
			if (payloadValue > 0) {
				this.state = undefined;
			}
		} else if (payloadValue === 255) {
			this.position = 100;
			this.state = payloadValue;
		}

		this.persistValues();
	}

	@ccValue()
	@ccValueMetadata({
		...ValueMetadata.ReadOnlyUInt8,
		label: "Barrier State",
		states: enumValuesToMetadataStates(BarrierState),
	})
	public readonly state: BarrierState | undefined;

	@ccValue()
	@ccValueMetadata({
		...ValueMetadata.ReadOnlyUInt8,
		label: "Barrier Position",
		unit: "%",
		max: 100,
	})
	public readonly position: number | undefined;

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: {
				"barrier position": this.position,
				"barrier state":
					this.state != undefined
						? getEnumMemberName(BarrierState, this.state)
						: "unknown",
			},
		};
	}
}

@CCCommand(BarrierOperatorCommand.Get)
@expectedCCResponse(BarrierOperatorCCReport)
export class BarrierOperatorCCGet extends BarrierOperatorCC {}

@CCCommand(BarrierOperatorCommand.CapabilitiesReport)
export class BarrierOperatorCCCapabilitiesReport extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options: CommandClassDeserializationOptions,
	) {
		super(driver, options);

		this._supportedSignalTypes = parseBitMask(
			this.payload,
			SignalType.Audible,
		);

		this.persistValues();
	}

	private _supportedSignalTypes: SignalType[];
	@ccValue({ internal: true })
	public get supportedSignalTypes(): readonly SignalType[] {
		return this._supportedSignalTypes;
	}

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: {
				"supported types": this.supportedSignalTypes
					.map((t) => `\n· ${getEnumMemberName(SignalType, t)}`)
					.join(""),
			},
		};
	}
}

@CCCommand(BarrierOperatorCommand.CapabilitiesGet)
@expectedCCResponse(BarrierOperatorCCCapabilitiesReport)
export class BarrierOperatorCCCapabilitiesGet extends BarrierOperatorCC {}

interface BarrierOperatorCCEventSetOptions extends CCCommandOptions {
	signalType: SignalType;
	signalState: SignalState;
}

@CCCommand(BarrierOperatorCommand.EventSet)
export class BarrierOperatorCCEventSet extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options:
			| CommandClassDeserializationOptions
			| BarrierOperatorCCEventSetOptions,
	) {
		super(driver, options);
		if (gotDeserializationOptions(options)) {
			// TODO: Deserialize payload
			throw new ZWaveError(
				`${this.constructor.name}: deserialization not implemented`,
				ZWaveErrorCodes.Deserialization_NotImplemented,
			);
		} else {
			this.type = options.signalType;
			this.state = options.signalState;
		}
	}
	public type: SignalType;
	public state: SignalState;

	public serialize(): Buffer {
		this.payload = Buffer.from([this.type, this.state]);
		return super.serialize();
	}

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: {
				"signal type": getEnumMemberName(SignalType, this.type),
				"signal state": getEnumMemberName(SignalState, this.state),
			},
		};
	}
}

@CCCommand(BarrierOperatorCommand.Report)
export class BarrierOperatorCCEventReport extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options: CommandClassDeserializationOptions,
	) {
		super(driver, options);

		validatePayload(this.payload.length >= 2);
		this._type = this.payload[0];
		this._state = this.payload[1];

		this.persistValues();
	}

	private _type: SignalType;
	@ccValue()
	@ccValueMetadata({
		...ValueMetadata.ReadOnlyUInt8,
		label: "Event Signal Type",
		states: enumValuesToMetadataStates(SignalType),
	})
	public get type(): SignalType {
		return this._type;
	}

	private _state: SignalState;
	@ccValue()
	@ccValueMetadata({
		...ValueMetadata.ReadOnlyUInt8,
		label: "Event Signal State",
		states: enumValuesToMetadataStates(SignalState),
	})
	public get state(): SignalState {
		return this._state;
	}

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: {
				"signal type": getEnumMemberName(SignalType, this.type),
				"signal state": getEnumMemberName(SignalState, this.state),
			},
		};
	}
}

interface BarrierOperatorCCEventGetOptions extends CCCommandOptions {
	signalType: SignalType;
}

@CCCommand(BarrierOperatorCommand.EventGet)
@expectedCCResponse(BarrierOperatorCCEventReport)
export class BarrierOperatorCCEventGet extends BarrierOperatorCC {
	public constructor(
		driver: Driver,
		options:
			| CommandClassDeserializationOptions
			| BarrierOperatorCCEventGetOptions,
	) {
		super(driver, options);
		if (gotDeserializationOptions(options)) {
			// TODO: Deserialize payload
			throw new ZWaveError(
				`${this.constructor.name}: deserialization not implemented`,
				ZWaveErrorCodes.Deserialization_NotImplemented,
			);
		} else {
			this.signalType = options.signalType;
		}
	}

	public signalType: SignalType;

	public serialize(): Buffer {
		this.payload = Buffer.from([this.signalType]);
		return super.serialize();
	}

	public toLogEntry(): MessageOrCCLogEntry {
		return {
			...super.toLogEntry(),
			message: {
				"signal type": getEnumMemberName(SignalType, this.signalType),
			},
		};
	}
}
