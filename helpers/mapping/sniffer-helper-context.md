[THIS IS A DRAFT PROMPT THAT HAS NOT BEEN EVALUTED AND MAY PRODUCE INCORRECT RESULTS]

## Context 

This is an application is an MQTT-to-I3X bridge. The bridge uses topic and payload Mapping pattern rules to decode, encode, and map classes or properties to SMProfile objects, stored in memory, and served to I3X clients. 

## Supporting Links

- I3X API Docs (Swagger): https://i3x.cesmii.net/docs
- I3X RFC https://github.com/cesmii/i3X/blob/main/RFC%20for%20Contextualized%20Manufacturing%20Information%20API.md
- CESMII SMProfile (UA Nodeset) Examples: 
-- https://github.com/OPCFoundation/UA-Nodeset
-- https://github.com/cesmii/SMProfiles/tree/main/nodeset2json

## User Query

I need to design a set of mapping rules and store them in config.yaml. The incoming data is not known yet and could be anything, but always delivered over MQTT. Your goal is to listen to data from the target broker, analyze it, and design a set of mapping rules to support mapping to I3X SMProfile objects, which are defined using the OPC UA Part 5 Class/Type system. Links above. This application's mapping rules are Mustache-style and custom to this application. The mapping rules will decompose MQTT JSON payloads into child SM Profile objects.

## Helpers

This repository contains helper utilites in /helpers. There is a CJS Javascript file called 'sniff-mqtt.cjs' within /helpers/mapping. There is also this file in /mapping - sniffer-helper-context.md. Three files together are your helper utilities - the sniff-mqtt.cjs file, this file sniffer-helper-context.md, and the example config file named EXAMPLE-config.yaml. You can use the helpers to 1- connect, subscribe, listen for and accumulate payloads from MQTT broker publish, then 2- review EXAMPLE-config.yaml to understand how the unique MQTT payloads should be individually decomposed and mapped to SMProfile objects for the I3X Server. Finally, 3- after the analysis is complete, a custom set of mappings for the unique target broker should be created and updated in config.yaml.

## Previous Payload Examples

### 1. abelara KPI (most common, ~5000+ topics)
```json
// Topic: abelara/uns-v2/Cappy Hour Inc/Site 1/Packaging/LabelerLine03/Sealer/kpis/oee
{
  "timestamp": "2026-02-12T07:25:08.633Z",
  "_model": "Models/Equipment/Process/Sealer",
  "_name": "Sealer",
  "_path": "Cappy Hour Inc/Site 1/Packaging/Line03/Sealer",
  "kpiName": "OEE",
  "value": {
    "_name": "OEE",
    "_model": "Models/Component/KPI",
    "_path": "Cappy Hour Inc/Site 1/Packaging/Line03/Sealer/KPIs/OEE",
    "EndTimestamp": 1770879600000,
    "Formula": "Availability × Performance × Quality",
    "Id": 1,
    "LogId": 232301,
    "Name": "OEE",
    "StartTimestamp": 1770850800000,
    "UnitsOfMeasure": "%",
    "Value": 87.7
  }
}
```

### 2. abelara State
```json
{
  "timestamp": "2026-02-12T07:24:52.528Z",
  "_model": "Models/Equipment/Process/Sealer",
  "_name": "Sealer",
  "_path": "Cappy Hour Inc/Site 1/Packaging/Line03/Sealer",
  "value": {
    "_name": "State",
    "_model": "Models/Component/State",
    "_path": "Cappy Hour Inc/Site 1/Packaging/Line03/Sealer/State",
    "FromId": 13,
    "FromName": "Idle",
    "Id": 13,
    "LogId": 2309,
    "Name": "Running",
    "TypeId": 1,
    "TypeName": "Running"
  }
}
```

### 3. abelara Production (deeply nested)
```json
{
  "timestamp": "2026-02-12T07:24:28.744Z",
  "_model": "Models/Equipment/Process/Filler",
  "_name": "Filler",
  "_path": "Cappy Hour Inc/Site 1/Filler Production/FillingLine02/Filler",
  "value": {
    "_name": "ProductionRun",
    "_model": "Models/Production/Run",
    "_path": "Cappy Hour Inc/Site 1/Filler Production/FillingLine02/Filler/ProductionRun",
    "EndTimestamp": null,
    "LogId": 739,
    "Material": {
      "_name": "Material",
      "_model": "Models/Material/Base",
      "_path": "Cappy Hour Inc/Site 1/Filler Production/FillingLine02/Filler/ProductionRun/Material",
      "Item": {
        "_name": "Item",
        "_model": "Models/Material/Item",
        "_path": "...",
        "Description": "0.5L filled Cola bottle",
        "Name": "Cola Soda 0.5L",
        "IdealCycleTime": 0.19,
        "UnitOfMeasure": "ea"
      }
    },
    "Running": true,
    "StartTimestamp": 1770880574004,
    "WorkOrder": "WO-L04-0789"
  }
}
```

### 4. abelara Material (multi-attribute nested)
```json
{
  "value": {
    "Density": {
      "_name": "Density",
      "_model": "Models/Attribute/Numeric",
      "_path": "...Tank02/Material/Density",
      "Value": {
        "_name": "Value",
        "_model": "Models/Value/Numeric",
        "_path": "...Tank02/Material/Density/Value",
        "NumberFormat": "#,##0.00",
        "String": "1,092.00 kg/m³",
        "UnitsOfMeasure": "kg/m³",
        "Value": 1092
      }
    },
    "Item": { "_name": "Item", "_model": "Models/Material/Item", ... },
    "Viscosity": { "_name": "Viscosity", "_model": "Models/Attribute/Numeric", ... }
  }
}
```

### 5. MaintainX CMMS assets
```json
// Topic: Enterprise A/maintainx/Dallas/Line 1/Hot End/Forhearth/Asset Info
{
  "id": 14553030,
  "name": "Forhearth",
  "description": "Conditions molten glass...",
  "parentId": null,
  "serialNumber": "",
  "locationId": 4288701,
  "createdAt": "2025-12-31T14:24:38.195Z"
}
```

### 6. OPC UA MachineIdentification
```json
{
  "manufacturer": {"locale": "en", "text": "Lantech"},
  "serialNumber": "LT2019-SL03-0491",
  "model": {"locale": "en", "text": "CS-300"},
  "softwareRevision": "1.9.0.1",
  "yearOfConstruction": 2019,
  "location": "The Cap Shack - Packaging Hall"
}
```

## Requirements

1. When a payload has nested objects with `_model`/`_name`/`_path` fields (abelara UNS pattern), decompose the nested objects into individual child ObjectInstances with HasComponent relationships to their parent.

2. For each decomposed child, extract scalar properties as individually addressable values (e.g., KPI's `Value`, `Formula`, `UnitsOfMeasure` each become their own ObjectValue).

3. The decomposition should be recursive — e.g., Material → Item, Density → Value should create nested children.

4. The parent object's `value` should still store the primary/summary value (e.g., the KPI's `Value` field).

5. The approach should be generic enough to handle the different payload shapes (KPI, State, Production, Material, MachineIdentification, MaintainX).

6. This should be config-driven via MappingRules in config.yaml so we can control which rules decompose and how.

7. Each decomposed child should have an appropriate `typeId` derived from the payload's `_model` field when available.

Please design a detailed implementation plan with specific code changes, file paths, and the config schema for the new decomposition feature.