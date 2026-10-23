package io.pockethive.pocketdata;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Responsibility: validate format metadata and convert CSV field types. Must not: publish records or discard extra fields. Contract: docs/DATASET.md. */
@Component
public class RecordFormat {
    private static final Set<String> TYPES = Set.of("string", "integer", "number", "boolean");
    public DatasetDefinition validate(DatasetDefinition dataset) {
        if (dataset == null) throw new ApiFailure(400, "Dataset definition is required.");
        CatalogStore.identifier(dataset.sutId()); CatalogStore.identifier(dataset.name());
        if (dataset.description() == null || dataset.description().length() > 2000 || dataset.fields() == null || dataset.fields().isEmpty() || dataset.fields().size() > 200 || dataset.lists() == null || dataset.lists().isEmpty() || dataset.lists().size() > 50) throw new ApiFailure(400, "Define fields and at least one data list.");
        Set<String> fields = new HashSet<>();
        for (RecordField field : dataset.fields()) {
            if (field == null || field.name() == null || !field.name().matches("[A-Za-z][A-Za-z0-9_]{0,79}") || !fields.add(field.name()) || !TYPES.contains(field.type())) throw new ApiFailure(400, "Invalid or duplicate record field/type.");
        }
        Set<String> lists = new HashSet<>();
        for (String list : dataset.lists()) if (!lists.add(CatalogStore.identifier(list))) throw new ApiFailure(400, "Duplicate data list.");
        return dataset;
    }
    public Map<String, Object> convert(DatasetDefinition format, Map<String, String> source) {
        Map<String, Object> result = new LinkedHashMap<>(source);
        for (RecordField field : format.fields()) {
            String value = source.get(field.name());
            if (value == null) {
                if (field.required()) throw new ApiFailure(400, "Missing CSV field: " + field.name());
                continue;
            }
            try {
                Object converted = switch (field.type()) {
                    case "string" -> value;
                    case "integer" -> Long.valueOf(value);
                    case "number" -> new BigDecimal(value);
                    case "boolean" -> {
                        if (!value.equals("true") && !value.equals("false")) throw new IllegalArgumentException();
                        yield Boolean.valueOf(value);
                    }
                    default -> throw new IllegalArgumentException();
                };
                result.put(field.name(), converted);
            } catch (IllegalArgumentException failure) { throw new ApiFailure(400, "Invalid " + field.type() + " value in field " + field.name()); }
        }
        return result;
    }
    public void validateUpdate(DatasetDefinition expected, DatasetDefinition definition) {
        validate(expected);
        validate(definition);
        if (!expected.sutId().equals(definition.sutId()) || !expected.name().equals(definition.name())) throw new ApiFailure(400, "A DataSet's SUT and name cannot change.");
        if (!definition.lists().containsAll(expected.lists()) || !definition.fields().containsAll(expected.fields())) throw new ApiFailure(400, "Existing lists and field definitions cannot be removed or changed while they may be in use.");
        for (RecordField field : definition.fields()) {
            if (!expected.fields().contains(field) && field.required()) throw new ApiFailure(400, "New fields must be optional so existing records remain usable.");
        }
    }
}
