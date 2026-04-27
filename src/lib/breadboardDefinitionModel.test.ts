import { createEmptyBreadboardDefinition } from './breadboardDefinitionModel'

describe('breadboardDefinitionModel', () => {
  it('creates a valid empty breadboard definition', () => {
    const definition = createEmptyBreadboardDefinition({
      id: 'definition-1',
      name: 'Board A',
      imageName: 'board-a.png',
      imagePath: '/__breadboard_local__/images/board-a.png',
      imageWidth: 1200,
      imageHeight: 420,
    })

    expect(definition).toEqual({
      id: 'definition-1',
      name: 'Board A',
      imageName: 'board-a.png',
      imagePath: '/__breadboard_local__/images/board-a.png',
      imageWidth: 1200,
      imageHeight: 420,
      points: [],
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    })
  })
})