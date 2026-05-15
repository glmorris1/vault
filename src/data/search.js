function includes(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function itemLabel(item, pin, image, location) {
  if (item?.name) return item.name;
  if (pin?.name) return pin.name;
  if (image?.name) return image.name;
  return location.name;
}

function imageLabel(image) {
  return image?.name || "Unnamed photo";
}

function pinLabel(pin) {
  return pin?.name || "Unnamed pin";
}

export function searchVault(data, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results = [];

  // Flatten the nested inventory into user-facing result rows with deep links.
  data.locations.forEach((location) => {
    if (includes(location.name, query)) {
      results.push({
        id: `location-${location.id}`,
        type: "Location",
        title: location.name,
        path: location.name,
        to: `/locations/${location.id}`,
      });
    }

    (location.rooms || []).forEach((room) => {
      if (includes(room.name, query)) {
        results.push({
          id: `room-${room.id}`,
          type: "Room",
          title: room.name,
          path: `${location.name} -> ${room.name}`,
          to: `/locations/${location.id}`,
        });
      }
    });

    getLocationImages(location).forEach(({ image, room }) => {
      if (includes(image.name, query)) {
        results.push({
          id: `image-${image.id}`,
          type: "Image",
          title: imageLabel(image),
          path: [location.name, room?.name, imageLabel(image)].filter(Boolean).join(" -> "),
          to: `/locations/${location.id}/images/${image.id}`,
        });
      }

      image.pins.forEach((pin) => {
        if (includes(pin.name, query) || includes(pin.notes, query)) {
          results.push({
            id: `pin-${pin.id}`,
            type: "Pin",
            title: pinLabel(pin),
            path: [location.name, room?.name, imageLabel(image), pinLabel(pin)].filter(Boolean).join(" -> "),
            to: `/locations/${location.id}/images/${image.id}/pins/${pin.id}`,
          });
        }

        pin.items.forEach((item) => {
          const matches =
            includes(item.name, query) ||
            includes(item.notes, query) ||
            includes(item.quantity, query) ||
            includes(item.estimatedValue, query);

          if (matches) {
            results.push({
              id: `item-${item.id}`,
              type: "Item",
              title: itemLabel(item, pin, image, location),
              path: [location.name, room?.name, imageLabel(image), pinLabel(pin)].filter(Boolean).join(" -> "),
              to: `/locations/${location.id}/images/${image.id}/pins/${pin.id}`,
            });
          }
        });
      });
    });
  });

  return results.slice(0, 30);
}

export function findLocation(data, locationId) {
  return data.locations.find((location) => location.id === locationId);
}

export function findImage(data, locationId, imageId) {
  const location = findLocation(data, locationId);
  if (!location) return { location, image: undefined, room: undefined };
  const legacyImage = (location.images || []).find((image) => image.id === imageId);
  if (legacyImage) return { location, image: legacyImage, room: undefined };

  for (const room of location.rooms || []) {
    const image = (room.images || []).find((item) => item.id === imageId);
    if (image) return { location, image, room };
  }

  return { location, image: undefined, room: undefined };
}

export function findPin(data, locationId, imageId, pinId) {
  const { location, image } = findImage(data, locationId, imageId);
  return { location, image, pin: image?.pins.find((pin) => pin.id === pinId) };
}

export function getLocationImages(location) {
  return [
    ...(location.images || []).map((image) => ({ image, room: undefined })),
    ...(location.rooms || []).flatMap((room) => (room.images || []).map((image) => ({ image, room }))),
  ];
}
