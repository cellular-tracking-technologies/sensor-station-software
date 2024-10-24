/**
 * ATSHA204A Chip Interface
 */
import Command from '../../command.js'

export default async () => {
  const id = await Command('hashlet serial-num')
	return id.substring(4,16)
}
